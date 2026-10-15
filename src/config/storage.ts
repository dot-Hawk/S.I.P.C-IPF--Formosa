const DEFAULT_UPLOADS_DIR = "uploads";

// Directory where attachment files are kept. Relative paths resolve against the process cwd.
export function getUploadsDir(): string {
  return process.env["UPLOADS_DIR"] || DEFAULT_UPLOADS_DIR;
}
