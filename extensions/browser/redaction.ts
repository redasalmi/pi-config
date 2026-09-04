const SENSITIVE_KEYS = new Set([
  "authorization", "proxyauthorization", "auth", "cookie", "setcookie", "password", "passwd",
  "secret", "clientsecret", "apikey", "xapikey", "token", "accesstoken", "refreshtoken",
  "csrftoken", "authtoken", "session", "sessionid", "phpsessid", "jsessionid", "credential", "signature", "sig", "jwt",
]);

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitiveKey(value: string): boolean {
  const key = normalizedKey(value);
  return SENSITIVE_KEYS.has(key)
    || /(?:authorization|cookie|password|passwd|token|secret|apikey|session|sessid|credential|signature|jwt)/.test(key);
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
    isSensitiveKey(decodedParameterKey(key)) ? `${prefix}${key}=[REDACTED]` : match
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

function redactText(input: string): string {
  return input
    .replace(URL_PATTERN, match => sanitizeUrl(match))
    .replace(/(--extra-(?:headers|headers-path)=)([^\s]+)/gi, "$1[REDACTED]")
    .replace(/((?:proxy-)?authorization\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(set-cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(cookie\s*:\s*)[^\r\n]+/gi, "$1[REDACTED]")
    .replace(/(["']?(?:authorization|cookie|set[-_]?cookie|password|passwd|token|secret|api[-_]?key|access[-_]?token|refresh[-_]?token)["']?\s*[:=]\s*)(\[REDACTED\]|"[^"]*"|'[^']*'|[^,}\s\]]+)/gi, "$1[REDACTED]")
    .replace(/(\b(?:access[-_]?token|refresh[-_]?token|auth(?:[-_]?token)?|api[-_]?key|client[-_]?secret|password|token|session(?:[-_]?id)?|(?:php|j)?sess(?:ion)?[-_]?id|credential|signature|jwt)\s*=\s*)[^\s,;&}]+/gi, "$1[REDACTED]");
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (!value || typeof value !== "object") return value;
  const object = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  const namedSensitive = typeof object.name === "string" && isSensitiveKey(object.name);
  for (const [key, entry] of Object.entries(object)) {
    result[key] = isSensitiveKey(key) || (namedSensitive && normalizedKey(key) === "value")
      ? "[REDACTED]"
      : redactValue(entry);
  }
  return result;
}

export function redactSecrets(input: string): string {
  if (!input) return input;
  try {
    return JSON.stringify(redactValue(JSON.parse(input)), null, 2);
  } catch {
    const lines = input.split("\n");
    let parsed = false;
    const output = lines.map(line => {
      try {
        const value = JSON.parse(line);
        parsed = true;
        return JSON.stringify(redactValue(value));
      } catch {
        return redactText(line);
      }
    });
    return parsed ? output.join("\n") : redactText(input);
  }
}

export function redactArgs(args: string[]): string[] {
  return args.map(redactSecrets);
}
