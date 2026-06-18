import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_CONFIG_PATH = "wrangler.deploy.toml";

export function validateDeployEnv(env) {
  const databaseId = String(env.D1_DATABASE_ID ?? "").trim();
  if (!databaseId) {
    throw new Error("缺少必要構建環境變數：D1_DATABASE_ID");
  }
  return {
    workerName: optionalValue(env.WORKER_NAME, "sso"),
    databaseName: optionalValue(env.D1_DATABASE_NAME, "openai_oidc_sso"),
    databaseId,
    
    // ====== 新增：从环境变量读取路由与 Vars ======
    workerRoutes: env.WORKER_ROUTES ? String(env.WORKER_ROUTES).split(",").map(r => r.trim()) : [],
    accountDomain: optionalValue(env.ACCOUNT_DOMAIN, ""),
    allowedRedirectUris: optionalValue(env.ALLOWED_REDIRECT_URIS, ""),
    issuer: optionalValue(env.ISSUER, ""),
    oidcClientId: optionalValue(env.OIDC_CLIENT_ID, "")
  };
}

export function createWranglerConfig(env = process.env) {
  const config = validateDeployEnv(env);
  
  let tomlContent = `name = ${quoteToml(config.workerName)}
main = "src/index.js"
compatibility_date = "2026-06-08"

`;

  // ====== 动态生成 ⁠routes ======
  if (config.workerRoutes.length > 0) {
    tomlContent += `routes = [\n`;
    for (const route of config.workerRoutes) {
      tomlContent += `  { pattern = ${quoteToml(route)}, custom_domain = true }\n`;
    }
    tomlContent += `]\n\n`;
  }

  // ====== 动态生成 [vars] ======
  // 只有当存在环境变量时才写入，避免写入空字符串
  if (config.accountDomain || config.allowedRedirectUris || config.issuer || config.oidcClientId) {
    tomlContent += `[vars]\n`;
    if (config.accountDomain) tomlContent += `ACCOUNT_DOMAIN = ${quoteToml(config.accountDomain)}\n`;
    if (config.allowedRedirectUris) tomlContent += `ALLOWED_REDIRECT_URIS = ${quoteToml(config.allowedRedirectUris)}\n`;
    if (config.issuer) tomlContent += `ISSUER = ${quoteToml(config.issuer)}\n`;
    if (config.oidcClientId) tomlContent += `OIDC_CLIENT_ID = ${quoteToml(config.oidcClientId)}\n`;
    tomlContent += `\n`;
  }

  // ====== D1 数据库配置 ======
  tomlContent += `[[d1_databases]]
binding = "DB"
database_name = ${quoteToml(config.databaseName)}
database_id = ${quoteToml(config.databaseId)}
`;

  return tomlContent;
}

export async function writeWranglerConfig({
  env = process.env,
  outputPath = process.env.WRANGLER_DEPLOY_CONFIG || DEFAULT_CONFIG_PATH
} = {}) {
  const content = createWranglerConfig(env);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, content, "utf8");
  return outputPath;
}

function optionalValue(value, fallback) {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function quoteToml(value) {
  return JSON.stringify(String(value));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeWranglerConfig()
    .then((outputPath) => {
      console.log(`已生成臨時 Wrangler 設定：${outputPath}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
}
