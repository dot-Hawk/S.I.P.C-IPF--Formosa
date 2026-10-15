const OBJECT_ID_FORMAT = /^[0-9a-fA-F]{24}$/;

// mongoose.isValidObjectId also accepts any 12-character string; request input must be a 24-char hex id.
export function isObjectIdString(value: unknown): value is string {
  return typeof value === "string" && OBJECT_ID_FORMAT.test(value);
}
