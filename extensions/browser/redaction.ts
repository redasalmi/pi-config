const SENSITIVE_KEYS = new Set([
  "authorization",
  "proxyauthorization",
  "auth",
  "cookie",
  "setcookie",
  "password",
  "passwd",
  "secret",
  "clientsecret",
  "apikey",
  "xapikey",
  "token",
  "accesstoken",
  "refreshtoken",
  "csrftoken",
  "authtoken",
  "session",
  "sessionid",
  "phpsessid",
  "jsessionid",
  "credential",
  "signature",
  "sig",
  "jwt",
]);

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(value: string): boolean {
  const key = normalizedKey(value);
  return (
    SENSITIVE_KEYS.has(key) ||
    /(?:authorization|cookie|password|passwd|token|secret|apikey|session|sessid|credential|signature|jwt)/.test(key)
  );
}

function decodedParameterKey(value: string): string {
  try {
    return decodeURIComponent(value.replaceAll("+", " "));
  } catch {
    return value;
  }
}

function redactSensitiveFragment(fragment: string): string {
  return fragment.replace(/(^|[?&])([^=?&]+)=([^&]*)/g, (match, prefix: string, key: string) =>
    isSensitiveKey(decodedParameterKey(key)) ? `${prefix}${key}=[REDACTED]` : match,
  );
}

function fragmentHasSensitiveParameter(fragment: string): boolean {
  for (const match of fragment.matchAll(/(?:^|[?&])([^=?&]+)=([^&]*)/g)) {
    if (isSensitiveKey(decodedParameterKey(match[1]))) return true;
  }
  return false;
}

const URL_PATTERN = /\b(?:https?|wss?):\/\/[^\s<>"'`]+/gi;

export function sanitizeUrl(value: string): string {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) {
      if (isSensitiveKey(key)) url.searchParams.set(key, "[REDACTED]");
    }
    if (url.hash.length > 1) url.hash = redactSensitiveFragment(url.hash.slice(1));
    return url.toString();
  } catch {
    return value;
  }
}

export function validateLocalCdpEndpoint(value: string): string {
  const endpoint = new URL(value);
  if (!["http:", "https:", "ws:", "wss:"].includes(endpoint.protocol)) {
    throw new Error("Shared CDP endpoints must use HTTP(S) or WS(S).");
  }
  if (!["127.0.0.1", "localhost", "[::1]"].includes(endpoint.hostname) || endpoint.username || endpoint.password) {
    throw new Error("Shared CDP endpoints must be local and must not contain credentials.");
  }
  if ([...endpoint.searchParams.keys()].some(isSensitiveKey) || fragmentHasSensitiveParameter(endpoint.hash.slice(1))) {
    throw new Error("Shared CDP endpoints must not contain secret-like query or fragment parameters.");
  }
  return endpoint.toString();
}

const SENSITIVE_PATTERN = [
  "proxy[-_]?authorization",
  "authorization",
  "set[-_]?cookie",
  "cookie",
  "x[-_]?api[-_]?key",
  "api[-_]?key",
  "x[-_]?auth[-_]?token",
  "auth[-_]?token",
  "access[-_]?token",
  "refresh[-_]?token",
  "csrf[-_]?token",
  "password",
  "passwd",
  "token",
  "client[-_]?secret",
  "x[-_]?secret",
  "secret",
].join("|");

// Assignment-style output uses a wider vocabulary than header/JSON-style output:
// `session_id=`, `credential=` and `jwt=` appear in query strings and free-form CLI
// text that has no key structure for redactValue to inspect.
const SENSITIVE_ASSIGNMENT_PATTERN = [
  SENSITIVE_PATTERN,
  "session(?:[-_]?id)?",
  "(?:php|j)?sess(?:ion)?[-_]?id",
  "auth(?:[-_]?token)?",
  "credential",
  "signature",
  "jwt",
].join("|");

function redactText(input: string): string {
  return (
    input
      .replace(URL_PATTERN, (match) => sanitizeUrl(match))
      .replace(/(--extra-(?:headers|headers-path)=)([^\s]+)/gi, "$1[REDACTED]")
      // Consume the whole credential, including a space-separated scheme such as
      // `Basic <base64>` or `Bearer <token>`, rather than only the scheme word.
      .replace(/((?:proxy-)?authorization\s*[:=]\s*)[^\r\n,;&}\]]+/gi, "$1[REDACTED]")
      .replace(/(set-cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
      .replace(/(cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
      // JSON embedded inside a string value, for example daemon status arguments.
      .replace(
        new RegExp(`(\\b(?:${SENSITIVE_PATTERN})\\b\\\\?["']\\s*:\\s*\\\\?["'])(.*?)(?=\\\\?["'])`, "gi"),
        "$1[REDACTED]",
      )
      .replace(new RegExp(`(\\b(?:${SENSITIVE_PATTERN})\\b["']?\\s*:\\s*["'])(.*?)(?=["'])`, "gi"), "$1[REDACTED]")
      .replace(new RegExp(`(\\b(?:${SENSITIVE_PATTERN})\\b\\s*:\\s*)[^\\r\\n]+`, "gi"), "$1[REDACTED]")
      // Query strings and form-like output, including snake_case keys. The negative
      // lookahead keeps an already-redacted value from being re-matched, which would
      // otherwise emit `[REDACTED]]`.
      .replace(
        new RegExp(
          `(\\b(?:${SENSITIVE_ASSIGNMENT_PATTERN})\\b\\s*=\\s*)(?!\\[REDACTED\\])(?:["'][^"']*["']|[^\\s,;&}\\]]+)`,
          "gi",
        ),
        "$1[REDACTED]",
      )
  );
}

function redactCookiePlainText(input: string): string {
  return input
    .replace(/(^|\n)([^=\n]+)=([^\n]*?)(\s+\(domain:[^\n]*\))(?=$|\n)/g, "$1$2=[REDACTED]$4")
    .replace(/(["']value["']\s*:\s*)("[^"]*"|'[^']*'|[^,}\s]+)/gi, "$1[REDACTED]");
}

function redactValue(value: unknown, ancestors: readonly string[] = []): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) {
    // DevTools represents key/value pairs as [name, value] tuples.
    if (value.length === 2 && typeof value[0] === "string" && isSensitiveKey(value[0])) {
      return [value[0], "[REDACTED]"];
    }
    return value.map((entry) => redactValue(entry, ancestors));
  }
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const namedSensitive = typeof object.name === "string" && isSensitiveKey(object.name);
  const cookieContext = ancestors.some((key) => normalizedKey(key).includes("cookie"));
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(object)) {
    result[key] =
      isSensitiveKey(key) || (normalizedKey(key) === "value" && (namedSensitive || cookieContext))
        ? "[REDACTED]"
        : redactValue(entry, [...ancestors, key]);
  }
  return result;
}

export type RedactionOptions = {
  /** Redact cookie value lines that cannot be parsed as JSON. */
  cookieValues?: boolean;
};

export function redactSecrets(input: string, options: RedactionOptions = {}): string {
  if (!input) return input;
  const cookie = (text: string) => (options.cookieValues ? redactCookiePlainText(text) : text);
  try {
    return JSON.stringify(redactValue(JSON.parse(input)), null, 2);
  } catch {
    const lines = input.split("\n");
    let parsed = false;
    const output = lines.map((line) => {
      try {
        const value = JSON.parse(line);
        parsed = true;
        return JSON.stringify(redactValue(value));
      } catch {
        return cookie(redactText(line));
      }
    });
    return parsed ? output.join("\n") : cookie(redactText(input));
  }
}

export function redactArgs(args: string[]): string[] {
  return args.map((arg) => redactSecrets(arg));
}
