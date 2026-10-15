import math

import pytest

from sipc_engine.domain.models import Observacion, Parametros, Variedad
from sipc_engine.domain.pipeline import calcular


def obs(variedad, informante, mes, precio, tipo="TRAD"):
    return Observacion(variedad=variedad, informante=informante, tipo=tipo, mes=mes, precio=precio)


def gmean(*values):
    return math.exp(sum(math.log(v) for v in values) / len(values))


def utilizado(resultado, variedad, informante, mes):
    return resultado.utilizados.get((variedad, informante), {}).get(mes)


def imputado(resultado, variedad, informante, mes):
    return resultado.imputados.get((variedad, informante), {}).get(mes)


def relativo(resultado, variedad, mes):
    return next(r.valor for r in resultado.relativos if r.variedad == variedad and r.mes == mes)


class TestImputacion:
    def test_missing_price_takes_the_geometric_mean_variation_of_its_variedad(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 200), obs("V1", "i3", "2026-01", 300),
            obs("V1", "i1", "2026-02", 110), obs("V1", "i2", "2026-02", 240),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

        assert imputado(r, "V1", "i3", "2026-02") == pytest.approx(300 * gmean(1.1, 1.2))

    def test_observed_prices_are_never_touched(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 200),
            obs("V1", "i1", "2026-02", 110),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

        assert imputado(r, "V1", "i1", "2026-02") == 110
        assert imputado(r, "V1", "i2", "2026-02") == pytest.approx(220)

    def test_falls_back_to_the_next_group_when_the_variedad_has_no_variation(self):
        # V2 has a single informant that disappears: V1 shares its group, so V1's variation is used.
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 100),
            obs("V2", "i1", "2026-01", 50),
            obs("V1", "i1", "2026-02", 120), obs("V1", "i2", "2026-02", 120),
        ]
        variedades = [Variedad("V1", grupos=("G",)), Variedad("V2", grupos=("G",))]

        r = calcular(observaciones, variedades, "2026-01", "2026-02")

        assert imputado(r, "V2", "i1", "2026-02") == pytest.approx(60)
        record = next(i for i in r.imputaciones if i.variedad == "V2")
        assert record.nivel == 1

    def test_goes_up_through_the_levels_until_one_has_data(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 100),
            obs("V3", "i1", "2026-01", 10),
            obs("V1", "i1", "2026-02", 150), obs("V1", "i2", "2026-02", 150),
        ]
        variedades = [
            Variedad("V1", grupos=("A", "X")),
            Variedad("V3", grupos=("B", "X")),  # different first group, same second group
        ]

        r = calcular(observaciones, variedades, "2026-01", "2026-02")

        assert imputado(r, "V3", "i1", "2026-02") == pytest.approx(15)

    def test_general_level_is_the_last_resort(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 100),
            obs("V3", "i1", "2026-01", 10),
            obs("V1", "i1", "2026-02", 130), obs("V1", "i2", "2026-02", 130),
        ]
        variedades = [Variedad("V1", grupos=("A",)), Variedad("V3", grupos=("B",))]

        r = calcular(observaciones, variedades, "2026-01", "2026-02")

        assert imputado(r, "V3", "i1", "2026-02") == pytest.approx(13)

    def test_a_price_missing_for_two_months_is_chained(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 100),
            obs("V1", "i1", "2026-02", 110),
            obs("V1", "i1", "2026-03", 121),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-03")

        assert imputado(r, "V1", "i2", "2026-02") == pytest.approx(110)
        assert imputado(r, "V1", "i2", "2026-03") == pytest.approx(121)

    def test_group_variations_come_only_from_observed_prices(self):
        # i3 is imputed in February; in March its imputed price must not feed the variation.
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 100), obs("V1", "i3", "2026-01", 100),
            obs("V1", "i1", "2026-02", 110), obs("V1", "i2", "2026-02", 110),
            obs("V1", "i1", "2026-03", 121), obs("V1", "i2", "2026-03", 132),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-03")

        assert imputado(r, "V1", "i3", "2026-02") == pytest.approx(110)
        assert imputado(r, "V1", "i3", "2026-03") == pytest.approx(110 * gmean(1.1, 1.2))

    def test_nothing_is_imputed_without_a_previous_price(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100),
            obs("V1", "i1", "2026-02", 110), obs("V1", "i2", "2026-02", 50),
            obs("V1", "i1", "2026-03", 120),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-03")

        # i2 appeared in February and is missing in March: February's observed price is the previous one.
        assert imputado(r, "V1", "i2", "2026-02") == 50
        assert imputado(r, "V1", "i2", "2026-03") == pytest.approx(50 * (120 / 110))

    def test_reports_prices_that_no_level_could_impute(self):
        # Every informant disappears: there is no variation anywhere.
        observaciones = [
            obs("V1", "i1", "2026-01", 100),
            obs("V2", "i2", "2026-01", 100),
            obs("V3", "i3", "2026-02", 5),
        ]
        variedades = [Variedad("V1"), Variedad("V2"), Variedad("V3")]

        r = calcular(observaciones, variedades, "2026-01", "2026-02")

        assert {(p.variedad, p.informante) for p in r.sin_imputar} == {("V1", "i1"), ("V2", "i2")}

    def test_special_treatment_variedades_are_left_out(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 100),
            obs("V1", "i1", "2026-02", 110),
            obs("E1", "i1", "2026-01", 10), obs("E1", "i2", "2026-01", 10),
            obs("E1", "i1", "2026-02", 20),
        ]
        variedades = [Variedad("V1"), Variedad("E1", tratamiento_especial=True)]

        r = calcular(observaciones, variedades, "2026-01", "2026-02")

        assert imputado(r, "E1", "i2", "2026-02") is None
        assert all(rel.variedad != "E1" for rel in r.relativos)
        assert r.especiales == ["E1"]


class TestOmitirGruposCompletos:
    """The original scripts skip a group whose rows (those with an observed previous price) all have
    an observed variation. A row that only has an imputed previous price is then estimated by the next,
    broader group instead of by its own group."""

    meses = ("2026-01", "2026-02", "2026-03")
    observaciones = [
        # VA and VB share group G; VC belongs to another group and everything shares ALL.
        obs("V1", "a1", "2026-01", 100), obs("V1", "a1", "2026-02", 110), obs("V1", "a1", "2026-03", 121),
        # b1 is missing in February and March: imputed in February, then it has no observed variation.
        obs("V2", "b1", "2026-01", 100),
        # c1 doubles every month; c2 stops in March (a gap in ALL, which makes ALL usable).
        obs("V3", "c1", "2026-01", 100), obs("V3", "c1", "2026-02", 200), obs("V3", "c1", "2026-03", 400),
        obs("V3", "c3", "2026-01", 100), obs("V3", "c3", "2026-02", 100),
    ]
    variedades = [
        Variedad("V1", grupos=("G", "ALL")),
        Variedad("V2", grupos=("G", "ALL")),
        Variedad("V3", grupos=("H", "ALL")),
    ]

    def test_by_default_it_reproduces_the_original_scripts(self):
        r = calcular(self.observaciones, self.variedades, "2026-01", "2026-03")

        # February: G has a gap (b1), so it imputes 100 * 1.1. March: G is complete -> skipped,
        # ALL (gmean of 1.1 and 2.0, with c3's gap) decides.
        assert imputado(r, "V2", "b1", "2026-02") == pytest.approx(110)
        assert imputado(r, "V2", "b1", "2026-03") == pytest.approx(110 * gmean(1.1, 2.0))

    def test_it_can_be_switched_off_so_the_finest_group_with_data_decides(self):
        r = calcular(
            self.observaciones, self.variedades, "2026-01", "2026-03",
            Parametros(omitir_grupos_completos=False),
        )

        assert imputado(r, "V2", "b1", "2026-03") == pytest.approx(110 * 1.1)


class TestPreciosUtilizados:
    def months(self, n):
        return [f"2026-{m:02d}" for m in range(1, n + 1)]

    def test_base_month_informants_are_used_with_imputed_values_when_missing(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 100),
            obs("V1", "i1", "2026-02", 110),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

        assert utilizado(r, "V1", "i2", "2026-02") == pytest.approx(110)

    def test_a_new_informant_enters_after_three_consecutive_observed_months(self):
        meses = self.months(5)
        observaciones = [obs("V1", "i1", m, 100) for m in meses]
        observaciones += [obs("V1", "n1", m, 50) for m in meses[1:]]  # appears in February

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-05")

        # Observed in Feb, Mar, Apr: it enters in April, so it counts as "previous" from May on.
        assert utilizado(r, "V1", "n1", "2026-03") is None
        assert utilizado(r, "V1", "n1", "2026-04") == 50
        assert utilizado(r, "V1", "n1", "2026-05") == 50

    def test_a_new_informant_missing_in_between_waits_for_three_in_a_row(self):
        meses = self.months(6)
        observaciones = [obs("V1", "i1", m, 100) for m in meses]
        observaciones += [obs("V1", "n1", m, 50) for m in ("2026-02", "2026-04", "2026-05", "2026-06")]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-06")

        assert utilizado(r, "V1", "n1", "2026-05") is None
        assert utilizado(r, "V1", "n1", "2026-06") == 50

    def test_a_short_series_does_not_admit_new_informants(self):
        observaciones = [obs("V1", "i1", "2026-01", 100), obs("V1", "i1", "2026-02", 100)]
        observaciones += [obs("V1", "n1", "2026-02", 50)]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

        assert ("V1", "n1") not in r.utilizados

    def test_varieties_missing_in_the_base_month_are_ignored(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i1", "2026-02", 110),
            obs("V9", "i1", "2026-02", 5),
        ]

        r = calcular(observaciones, [Variedad("V1"), Variedad("V9")], "2026-01", "2026-02")

        assert all(key[0] != "V9" for key in r.utilizados)


class TestRelativos:
    def test_relative_is_the_ratio_of_geometric_means_over_informants_with_both_prices(self):
        observaciones = [
            obs("V1", "i1", "2026-01", 100), obs("V1", "i2", "2026-01", 400),
            obs("V1", "i1", "2026-02", 110), obs("V1", "i2", "2026-02", 480),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

        assert relativo(r, "V1", "2026-02") == pytest.approx(gmean(110, 480) / gmean(100, 400))

    def test_both_informant_types_are_combined_with_weights_025_and_075(self):
        observaciones = [
            obs("V1", "s1", "2026-01", 100, "SUPER"), obs("V1", "t1", "2026-01", 100, "TRAD"),
            obs("V1", "s1", "2026-02", 120, "SUPER"), obs("V1", "t1", "2026-02", 110, "TRAD"),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

        expected = (120 ** 0.25 * 110 ** 0.75) / (100 ** 0.25 * 100 ** 0.75)
        assert relativo(r, "V1", "2026-02") == pytest.approx(expected)

    def test_a_single_type_is_used_as_it_is(self):
        observaciones = [
            obs("V1", "s1", "2026-01", 100, "SUPER"),
            obs("V1", "s1", "2026-02", 130, "SUPER"),
        ]

        r = calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

        assert relativo(r, "V1", "2026-02") == pytest.approx(1.3)

    def test_weights_are_configurable(self):
        observaciones = [
            obs("V1", "s1", "2026-01", 100, "SUPER"), obs("V1", "t1", "2026-01", 100, "TRAD"),
            obs("V1", "s1", "2026-02", 120, "SUPER"), obs("V1", "t1", "2026-02", 110, "TRAD"),
        ]

        r = calcular(
            observaciones, [Variedad("V1")], "2026-01", "2026-02",
            Parametros(peso_super=0.5, peso_trad=0.5),
        )

        assert relativo(r, "V1", "2026-02") == pytest.approx(math.sqrt(1.2 * 1.1))

    def test_a_variedad_without_pairs_has_no_relative_instead_of_disappearing(self):
        # February has data, but none of the base-month varieties can be priced in it.
        observaciones = [
            obs("V1", "i1", "2026-01", 100),
            obs("V2", "i1", "2026-01", 10),
            obs("V9", "i9", "2026-02", 5),
        ]

        r = calcular(observaciones, [Variedad("V1"), Variedad("V2"), Variedad("V9")], "2026-01", "2026-02")

        assert relativo(r, "V1", "2026-02") is None
        assert relativo(r, "V2", "2026-02") is None


class TestValidation:
    def test_requires_observations_in_every_month_of_the_range(self):
        observaciones = [obs("V1", "i1", "2026-01", 100), obs("V1", "i1", "2026-03", 110)]

        with pytest.raises(ValueError, match="2026-02"):
            calcular(observaciones, [Variedad("V1")], "2026-01", "2026-03")

    def test_rejects_observations_outside_the_range(self):
        observaciones = [obs("V1", "i1", "2026-01", 100), obs("V1", "i1", "2026-04", 110)]

        with pytest.raises(ValueError, match="2026-04"):
            calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

    def test_rejects_non_positive_prices(self):
        with pytest.raises(ValueError, match="precio"):
            calcular([obs("V1", "i1", "2026-01", 0)], [Variedad("V1")], "2026-01", "2026-01")

    def test_rejects_an_informant_with_two_types(self):
        observaciones = [obs("V1", "i1", "2026-01", 100, "SUPER"), obs("V1", "i1", "2026-02", 100, "TRAD")]

        with pytest.raises(ValueError, match="tipo"):
            calcular(observaciones, [Variedad("V1")], "2026-01", "2026-02")

    def test_rejects_duplicated_observations(self):
        observaciones = [obs("V1", "i1", "2026-01", 100), obs("V1", "i1", "2026-01", 101)]

        with pytest.raises(ValueError, match="duplicad"):
            calcular(observaciones, [Variedad("V1")], "2026-01", "2026-01")

    def test_rejects_unknown_variedades_and_bad_months(self):
        with pytest.raises(ValueError, match="V9"):
            calcular([obs("V9", "i1", "2026-01", 1)], [Variedad("V1")], "2026-01", "2026-01")
        with pytest.raises(ValueError, match="mes"):
            calcular([obs("V1", "i1", "2026-13", 1)], [Variedad("V1")], "2026-13", "2026-13")
        with pytest.raises(ValueError, match="anterior"):
            calcular([], [Variedad("V1")], "2026-03", "2026-01")
