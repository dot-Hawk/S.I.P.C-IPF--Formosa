import { describe, it } from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { type UserRepository } from "../repositories/user.repository.js";
import { authLocals, invoke } from "../testing/http.js";
import { createUserController } from "./user.controller.js";

const BODY = {
  nombre: "Ana",
  apellido: "Perez",
  dni: "30123456",
  legajo: "L-100",
  email: "ana@example.com",
  password: "long-enough-password",
  role: "ANALISTA",
};

function create(repo: Partial<UserRepository>, body: Record<string, unknown> = BODY) {
  return invoke(createUserController(repo as UserRepository).create, { body });
}

describe("user controller create", () => {
  it("hashes the password, forces ACTIVO and never returns the hash", async () => {
    let received: Record<string, unknown> | undefined;
    const repo = {
      create: async (data: Record<string, unknown>) => {
        received = data;
        return { id: "u-1", ...data };
      },
    };

    const res = await create(repo as unknown as Partial<UserRepository>, { ...BODY, estado: "INACTIVO" });

    assert.equal(res.statusCode, 201);
    assert.equal(received?.["estado"], "ACTIVO");
    assert.notEqual(received?.["passwordHash"], BODY.password);
    assert.ok(await bcrypt.compare(BODY.password, String(received?.["passwordHash"])));
    assert.equal((res.body as { id: string }).id, "u-1");
    assert.equal("passwordHash" in (res.body as object), false);
    assert.equal("password" in (res.body as object), false);
  });

  it("stores the email trimmed and lowercase", async () => {
    let received: Record<string, unknown> | undefined;
    const repo = {
      create: async (data: Record<string, unknown>) => {
        received = data;
        return { id: "u-1", ...data };
      },
    };

    await create(repo as unknown as Partial<UserRepository>, { ...BODY, email: "  Ana@Example.COM " });

    assert.equal(received?.["email"], "ana@example.com");
  });

  it("answers 409 on duplicate dni, legajo or email", async () => {
    const repo = {
      create: async () => {
        throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
      },
    };

    assert.equal((await create(repo as unknown as Partial<UserRepository>)).statusCode, 409);
  });

  it("rethrows unexpected errors", async () => {
    const repo = {
      create: async () => {
        throw new Error("connection lost");
      },
    };

    await assert.rejects(create(repo as unknown as Partial<UserRepository>), /connection lost/);
  });
});

const ME = "00000000-0000-4000-8000-0000000000aa";
const TARGET = "00000000-0000-4000-8000-0000000000bb";
const COORD = authLocals(ME, "COORDINADOR");
const STORED = {
  id: TARGET,
  nombre: "Ana",
  apellido: "Perez",
  dni: "30123456",
  legajo: "L-100",
  email: "ana@example.com",
  passwordHash: "$2a$10$secret",
  role: "ANALISTA",
  estado: "ACTIVO",
  ultimoAcceso: null,
};

function controller(repo: object) {
  return createUserController(repo as UserRepository);
}

describe("user controller management", () => {
  describe("list", () => {
    it("lists users without their password hash, passing the filters and the page", async () => {
      let received: unknown[] = [];
      const repo = {
        list: async (...a: unknown[]) => {
          received = a;
          return [STORED];
        },
      };

      const res = await invoke(
        controller(repo).list,
        { query: { role: "ANALISTA", estado: "ACTIVO", limit: "10", page: "2", junk: "x" } },
        COORD,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(received, [{ role: "ANALISTA", estado: "ACTIVO" }, { limit: 10, offset: 10 }]);
      assert.equal("passwordHash" in (res.body as object[])[0]!, false);
    });

    it("answers 400 on an invalid filter", async () => {
      const res = await invoke(controller({}).list, { query: { role: "ROOT" } }, COORD);

      assert.equal(res.statusCode, 400);
    });
  });

  describe("getById", () => {
    it("answers 400, 404 and 200 without the hash", async () => {
      const found = controller({ findById: async () => STORED });
      const missing = controller({ findById: async () => null });

      assert.equal((await invoke(found.getById, { params: { id: "x" } }, COORD)).statusCode, 400);
      assert.equal((await invoke(missing.getById, { params: { id: TARGET } }, COORD)).statusCode, 404);
      const ok = await invoke(found.getById, { params: { id: TARGET } }, COORD);
      assert.equal(ok.statusCode, 200);
      assert.equal("passwordHash" in (ok.body as object), false);
    });
  });

  describe("update", () => {
    it("applies only the editable fields, lowercasing the email", async () => {
      let args: unknown[] = [];
      const repo = {
        update: async (...a: unknown[]) => {
          args = a;
          return STORED;
        },
      };

      const res = await invoke(
        controller(repo).update,
        { params: { id: TARGET }, body: { nombre: " Ana ", email: " ANA@Example.com ", role: "SUPERVISOR", estado: "INACTIVO" } },
        COORD,
      );

      assert.equal(res.statusCode, 200);
      assert.deepEqual(args, [TARGET, { nombre: "Ana", email: "ana@example.com", role: "SUPERVISOR" }]);
    });

    it("does not let a coordinator change their own role, but lets them edit their data", async () => {
      const repo = { update: async () => STORED };

      const role = await invoke(controller(repo).update, { params: { id: ME }, body: { role: "ANALISTA" } }, COORD);
      const data = await invoke(controller(repo).update, { params: { id: ME }, body: { nombre: "Nuevo" } }, COORD);

      assert.equal(role.statusCode, 403);
      assert.equal(data.statusCode, 200);
    });

    it("answers 404 for an unknown user and 409 on a duplicated dni, legajo or email", async () => {
      const missing = controller({ update: async () => null });
      const duplicated = controller({
        update: async () => {
          throw Object.assign(new Error("Failed query"), { cause: { code: "23505" } });
        },
      });

      assert.equal((await invoke(missing.update, { params: { id: TARGET }, body: { nombre: "A" } }, COORD)).statusCode, 404);
      assert.equal((await invoke(duplicated.update, { params: { id: TARGET }, body: { dni: "1" } }, COORD)).statusCode, 409);
    });
  });

  describe("setEstado", () => {
    it("changes the estado of another user", async () => {
      let args: unknown[] = [];
      const repo = {
        update: async (...a: unknown[]) => {
          args = a;
          return { ...STORED, estado: "INACTIVO" };
        },
      };

      const res = await invoke(controller(repo).setEstado, { params: { id: TARGET }, body: { estado: "INACTIVO", role: "x" } }, COORD);

      assert.equal(res.statusCode, 200);
      assert.deepEqual(args, [TARGET, { estado: "INACTIVO" }]);
    });

    it("does not let a coordinator deactivate themselves, and answers 404 for an unknown user", async () => {
      const self = await invoke(controller({ update: async () => STORED }).setEstado, { params: { id: ME }, body: { estado: "INACTIVO" } }, COORD);
      const missing = await invoke(controller({ update: async () => null }).setEstado, { params: { id: TARGET }, body: { estado: "INACTIVO" } }, COORD);

      assert.equal(self.statusCode, 403);
      assert.equal(missing.statusCode, 404);
    });
  });

  describe("resetPassword", () => {
    it("stores a new hash and answers 204", async () => {
      let args: unknown[] = [];
      const repo = {
        update: async (...a: unknown[]) => {
          args = a;
          return STORED;
        },
      };

      const res = await invoke(controller(repo).resetPassword, { params: { id: TARGET }, body: { password: "brand-new-password" } }, COORD);

      assert.equal(res.statusCode, 204);
      const [id, changes] = args as [string, { passwordHash: string }];
      assert.equal(id, TARGET);
      assert.ok(await bcrypt.compare("brand-new-password", changes.passwordHash));
    });

    it("answers 404 for an unknown user", async () => {
      const res = await invoke(controller({ update: async () => null }).resetPassword, { params: { id: TARGET }, body: { password: "brand-new-password" } }, COORD);

      assert.equal(res.statusCode, 404);
    });
  });
});
