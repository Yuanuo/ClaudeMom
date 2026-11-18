import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { claudeState, emptyProfile, formatWindow, hostOf, normalizeModels, normalizeRoutes, profileModelLabel, profileProblem, setupSteps, targetLabel, templateLabel, type ClaudeStatus, type ModelRoute } from "./model.ts";

const status = (patch: Partial<ClaudeStatus> = {}): ClaudeStatus => ({
  supported: true, sourceApp: "", version: "1.0", claudeRunning: false, running: false, connected: false,
  caReady: true, caTrusted: true, caMachineSupported: true, caMachineTrusted: false, nodeAvailable: true, dictationReady: true, models: [], needsRestart: false,
  config: { enabled: true, model: "", localization: true, voiceInput: false, computerUse: false, backgroundMode: false },
  ...patch,
});

test("上游表单：要有效的 Base URL 和默认模型，不能写到 /v1/messages", () => {
  const profile = { ...emptyProfile(), baseUrl: "https://api.example.com", model: "glm-5" };
  assert.equal(profileProblem(profile), null);
  assert.equal(profileProblem({ ...profile, baseUrl: "" }), "填一个 Base URL");
  assert.equal(profileProblem({ ...profile, baseUrl: "api.example.com" }), "Base URL 不是有效地址");
  assert.equal(profileProblem({ ...profile, baseUrl: "ftp://x" }), "Base URL 要以 http:// 或 https:// 开头");
  assert.match(profileProblem({ ...profile, baseUrl: "https://x/v1/messages" }) ?? "", /不要带/);
  assert.equal(profileProblem({ ...profile, model: " " }), "选一个默认模型");
  assert.equal(hostOf("http://127.0.0.1:3425"), "127.0.0.1:3425");
});

test("模型列表去重，默认模型排第一", () => {
  assert.deepEqual(normalizeModels(["b", " a ", "b", ""], "a"), ["a", "b"]);
});

test("模型映射：同一角色只留最后一条；没填实际模型的行也保留", () => {
  const route = (slot: string, id: string, target: string, name = "", supports1m = false): ModelRoute => ({ slot, id, target, name, supports1m });
  assert.deepEqual(normalizeRoutes([
    route("sonnet", " claude-sonnet-5-5 ", " deepseek-flash ", " Sonnet 5.5 ", true),
    route("sonnet", "claude-sonnet-5", "deepseek-pro", "第二版"),
    route("haiku", "claude-haiku-5-5", ""),
    route("opus", "", "deepseek-pro"),
  ]), [
    { slot: "sonnet", id: "claude-sonnet-5", target: "deepseek-pro", name: "第二版", supports1m: false },
    { slot: "haiku", id: "claude-haiku-5-5", target: "", name: "", supports1m: false },
  ]);
});

test("模型映射校验：官方 ID 格式和重复；没填实际模型的行不参与", () => {
  const profile = { ...emptyProfile(), baseUrl: "https://api.example.com", model: "deepseek-flash" };
  const route = (slot: string, id: string, target: string): ModelRoute => ({ slot, id, target, name: "", supports1m: false });
  assert.match(profileProblem({ ...profile, routes: [route("sonnet", "Claude-Sonnet-5-5", "deepseek-flash")] }) ?? "", /不对/);
  assert.match(profileProblem({ ...profile, routes: [route("sonnet", "claude-sonnet-5-5", "a"), route("opus", "claude-sonnet-5-5", "b")] }) ?? "", /两个角色/);
  assert.equal(profileProblem({ ...profile, routes: [route("sonnet", "claude-sonnet-5-5", "deepseek-flash")] }), null);
  assert.equal(profileProblem({ ...profile, routes: [route("sonnet", "bad id", "")] }), null, "没填实际模型时先不拦");
});

test("角色映射显示：默认 Sonnet 和每个上游模型被哪些角色使用", () => {
  const profile = {
    ...emptyProfile(),
    modelNames: { "deepseek-flash": "DeepSeek Flash", "deepseek-pro": "DeepSeek Pro" },
    routes: [
      { slot: "sonnet", id: "claude-sonnet-5-5", target: "deepseek-flash", name: "Sonnet 5.5", supports1m: true },
      { slot: "haiku", id: "claude-haiku-5-5", target: "deepseek-flash", name: "Haiku 5.5", supports1m: false },
      { slot: "opus", id: "claude-opus-5-5", target: "deepseek-pro", name: "Opus 5.5", supports1m: false },
    ],
  };
  assert.equal(profileModelLabel(profile), "Sonnet 5.5 ← DeepSeek Flash");
  assert.equal(targetLabel(profile, "deepseek-flash"), "DeepSeek Flash（Sonnet / Haiku）");
  assert.equal(targetLabel(profile, "deepseek-pro"), "DeepSeek Pro（Opus）");
  assert.equal(targetLabel(profile, "other"), "other");
});

test("状态文案：已连接、运行中、外部打开、未启动", () => {
  assert.deepEqual(claudeState(null, null), { text: "正在检测 Claude…", tone: "busy" });
  assert.equal(claudeState(status({ connected: true }), null).tone, "ok");
  assert.equal(claudeState(status({ claudeRunning: true }), null).tone, "warn");
  assert.equal(claudeState(status(), null).text, "未启动");
  assert.equal(claudeState(status(), "launch").text, "正在启动…");
  assert.equal(claudeState(status({ supported: false }), null).text, "没有找到 Claude Desktop");
});

test("启动前清单按顺序列出缺的步骤", () => {
  const ready = { ...emptyProfile(), baseUrl: "https://a.example", model: "m" };
  assert.deepEqual(setupSteps(status(), ready), []);
  assert.deepEqual(setupSteps(status({ caTrusted: false, nodeAvailable: false }), null).map((step) => step.id), ["upstream", "node", "trust"]);
  // 第三方模式不经代理：不要求信任证书。
  assert.deepEqual(setupSteps(status({ caTrusted: false, config: { ...status().config, threePMode: true } }), null).map((step) => step.id), ["upstream"]);
});

test("窗口显示", () => {
  assert.equal(formatWindow(null), "200k");
  assert.equal(formatWindow(1_000_000), "1M");
  assert.equal(formatWindow(1_100_000), "1.1M");
  assert.equal(formatWindow(400_000), "400k");
});

test("前端调用的命令都在后端注册了", () => {
  const app = readFileSync(new URL("./ClaudeMomApp.tsx", import.meta.url), "utf8");
  const lib = readFileSync(new URL("../src-tauri/src/lib.rs", import.meta.url), "utf8");
  // 命令名有的直接传给 invoke，有的经 bookCall 转一手：按字面量收。
  const called = new Set([...app.matchAll(/"(claude_(?:mom|local)_[a-z_]+)"/g)].map((match) => match[1]));
  assert.ok(called.size >= 9, [...called].join(","));
  for (const command of called) assert.ok(new RegExp(`::${command},`).test(lib), `${command} 没有注册`);
});

test("recorded template versions are labelled by build date and id", () => {
  const label = templateLabel({ build: "a4ced7f85b", builtAt: 1794603257 });
  assert.match(label, /^2026-11-1[34] · a4ced7f85b$/);
  assert.equal(templateLabel({ build: "x1", builtAt: null }), "x1");
});
