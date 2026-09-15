import https from "node:https";
import { URL } from "node:url";

const EJI_USER_AGENT = "BlackboxAuditor/1.0 (+https://github.com/blackbox-auditor; research prototype)";

/** eji.hu serves an incomplete cert chain (Microsec e-Szigno); curl works, Node fetch rejects by default. */
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function mergeCookies(existing: string, setCookie: string | string[] | undefined): string {
  const jar = new Map<string, string>();
  for (const part of existing.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name) jar.set(name, rest.join("="));
  }
  const chunks = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const header of chunks) {
    for (const chunk of header.split(/,(?=\s*[A-Za-z_][A-Za-z0-9_-]*=)/)) {
      const pair = chunk.split(";")[0]?.trim();
      if (!pair) continue;
      const eq = pair.indexOf("=");
      if (eq <= 0) continue;
      jar.set(pair.slice(0, eq), pair.slice(eq + 1));
    }
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function httpsRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: options.method ?? "GET",
        headers: options.headers,
        agent: insecureAgent,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers as Record<string, string | string[] | undefined>,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      },
    );
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

/** Symfony form POST — GET session first, then submit search. */
export async function ejiFormPost(
  url: string,
  fields: Record<string, string>,
  timeoutMs = 20_000,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let cookies = "";
    const getRes = await httpsRequest(url, {
      headers: { "User-Agent": EJI_USER_AGENT, Accept: "text/html" },
    });
    cookies = mergeCookies(cookies, getRes.headers["set-cookie"]);

    const body = new URLSearchParams(fields).toString();
    const postRes = await httpsRequest(url, {
      method: "POST",
      headers: {
        "User-Agent": EJI_USER_AGENT,
        Accept: "text/html",
        "Content-Type": "application/x-www-form-urlencoded",
        "Content-Length": String(Buffer.byteLength(body)),
        Cookie: cookies,
      },
      body,
    });

    if (postRes.status < 200 || postRes.status >= 300) {
      throw new Error(`EJI HTTP ${postRes.status} for ${url}`);
    }
    return postRes.body;
  } finally {
    clearTimeout(timer);
  }
}
