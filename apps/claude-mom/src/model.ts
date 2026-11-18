/**
 * ClaudeMom 界面的纯逻辑：后端数据类型、状态文案、表单校验。不依赖 React / Tauri，便于单测。
 */

export type CommandStatus = "ok" | "failed" | string;
export type CommandResult<T> = T & { status: CommandStatus; message: string };

export type UpstreamSource = "manual" | "ccswitch" | "magpie" | "codexpp";

/** 一条模型映射：官方角色 → 实际请求的上游模型。 */
export type ModelRoute = {
  /** 角色槽：sonnet / opus / fable / haiku / custom，只用于表单分组。 */
  slot: string;
  /** 客户端看到的官方模型 ID（例如 claude-sonnet-5-5）。 */
  id: string;
  /** 实际请求的上游模型 ID；空 = 这个角色不用。 */
  target: string;
  /** 选择器显示名；空 = 用官方/上游名字。 */
  name: string;
  /** 向客户端声明 1M 上下文。 */
  supports1m: boolean;
};

/** 默认展示的四个官方模型角色（和 CC-Switch 的模型映射一致）。 */
export type ModelSlot = { slot: string; label: string; fallbackId: string };
export const MODEL_SLOTS: ModelSlot[] = [
  { slot: "sonnet", label: "Sonnet", fallbackId: "claude-sonnet-5-5" },
  { slot: "opus", label: "Opus", fallbackId: "claude-opus-5-5" },
  { slot: "fable", label: "Fable", fallbackId: "claude-fable-5-2" },
  { slot: "haiku", label: "Haiku", fallbackId: "claude-haiku-5-5" },
];

/** 一组上游（与 core `claude_mom::UpstreamProfile` 字段一致）。 */
export type UpstreamProfile = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  smallModel: string;
  models: string[];
  contextWindow: number | null;
  /** 模型显示名（上游 `/v1/models` 的 display_name）。 */
  modelNames: Record<string, string>;
  /** 模型映射；没有行 = 按上游模型原样显示。 */
  routes: ModelRoute[];
  source: UpstreamSource | string;
  sourceId: string;
};

export type UpstreamBook = { profiles: UpstreamProfile[]; activeId: string | null };

export type UpstreamModel = { id: string; displayName: string | null; contextWindow: number | null };

/** 官方模型候选（来自内嵌录制模板，和当前 Claude 版本一致）。 */
export type OfficialModel = { id: string; name: string };

/** 模板解析失败时的兜底候选；用户仍可手填任意官方 ID。 */
export const FALLBACK_OFFICIAL_MODELS: OfficialModel[] = [
  { id: "claude-fable-5-2", name: "Fable 5.2" },
  { id: "claude-opus-5-5", name: "Opus 5.5" },
  { id: "claude-sonnet-5-5", name: "Sonnet 5.5" },
  { id: "claude-haiku-5-5", name: "Haiku 5.5" },
  { id: "claude-fable-5-1", name: "Fable 5.1" },
  { id: "claude-opus-5", name: "Opus 5" },
  { id: "claude-sonnet-5", name: "Sonnet 5" },
  { id: "claude-fable-5", name: "Fable 5" },
  { id: "claude-opus-4-6", name: "Opus 4.6" },
  { id: "claude-sonnet-4-6", name: "Sonnet 4.6" },
  { id: "claude-opus-4-5", name: "Opus 4.5" },
  { id: "claude-sonnet-4-5", name: "Sonnet 4.5" },
  { id: "claude-haiku-4-5", name: "Haiku 4.5" },
];

/** 官方模型的默认显示名；不在候选里就用 ID 本身。 */
export function officialName(official: OfficialModel[], id: string): string {
  return official.find((model) => model.id === id)?.name || id;
}

/** 官方 ID 属于哪个角色家族。 */
export function slotOf(id: string): string {
  for (const family of ["sonnet", "opus", "fable", "haiku"]) {
    if (id.includes(`-${family}-`) || id.endsWith(`-${family}`)) return family;
  }
  return "custom";
}

export function slotLabel(slot: string): string {
  return MODEL_SLOTS.find((item) => item.slot === slot)?.label ?? (slot === "custom" ? "自定义" : slot);
}

/** 角色对应的最新官方 ID：候选里同一家族版本号最大的那个。 */
export function defaultOfficialId(official: OfficialModel[], slot: string, fallback: string): string {
  let best = "";
  let bestScore = -1;
  for (const model of official) {
    if (slotOf(model.id) !== slot) continue;
    const rest = model.id.startsWith(`claude-${slot}-`) ? model.id.slice(`claude-${slot}-`.length) : "";
    const score = rest.split("-").reduce((acc, part) => acc * 100 + (Number.parseInt(part, 10) || 0), 0);
    if (score > bestScore) {
      best = model.id;
      bestScore = score;
    }
  }
  if (best) return best;
  const known = official.find((model) => model.id.startsWith(`claude-${slot}`));
  return known?.id ?? fallback;
}

/** 界面上显示的模型名：有显示名用显示名，否则用 id。 */
export function modelLabel(profile: Pick<UpstreamProfile, "modelNames">, id: string): string {
  return profile.modelNames?.[id] || id;
}

/** 某个角色（slot）当前的映射行。 */
export function routeForSlot(profile: Pick<UpstreamProfile, "routes">, slot: string): ModelRoute | undefined {
  return profile.routes?.find((route) => (route.slot || slotOf(route.id)) === slot);
}

/** 实际生效的默认角色：优先 Sonnet，其次第一个有上游模型的行。 */
export function defaultRoute(profile: Pick<UpstreamProfile, "routes">): ModelRoute | undefined {
  const active = (profile.routes ?? []).filter((route) => route.id.trim() && route.target.trim());
  return active.find((route) => (route.slot || slotOf(route.id)) === "sonnet") ?? active[0];
}

/** 侧边栏/标题栏的模型说明：「Sonnet 5.5 ← DeepSeek Flash」。 */
export function profileModelLabel(profile: Pick<UpstreamProfile, "model" | "modelNames" | "routes">): string {
  const route = defaultRoute(profile);
  if (!route) return profile.model ? modelLabel(profile, profile.model) : "";
  return `${route.name.trim() || route.id.trim()} ← ${modelLabel(profile, route.target)}`;
}

/** 默认模型下拉的说明：这个上游模型被填到了哪些角色。 */
export function targetLabel(profile: Pick<UpstreamProfile, "modelNames" | "routes">, target: string): string {
  const roles = [...new Set((profile.routes ?? [])
    .filter((route) => route.target === target && route.id.trim())
    .map((route) => slotLabel(route.slot || slotOf(route.id))))];
  return roles.length ? `${modelLabel(profile, target)}（${roles.join(" / ")}）` : modelLabel(profile, target);
}

/** Claude 本地服务的设置（与 core `ClaudeLocalSettings` 一致，只列界面用到的）。 */
export type ClaudeConfig = {
  enabled: boolean;
  model: string;
  localization: boolean;
  voiceInput: boolean;
  computerUse: boolean;
  backgroundMode: boolean;
  /** 无视 Claude 对后台模式的 macOS 版本上限。 */
  forceBackgroundMode?: boolean;
  /** 打开 Cowork 的总开关（默认开）。 */
  cowork?: boolean;
  /** 用 Claude 的合并式主页：对话和 Cowork 合在一起，没有「对话 | Cowork」切换（默认关）。 */
  hubHome?: boolean;
  /** 录制版用哪个录制版本（前端 build id）；空 = 最新。 */
  template?: string;
  /** 界面选「本机版」：用 Claude 自己的第三方模式启动（安装包自带的新界面，推理走本地服务；默认录制版）。 */
  threePMode?: boolean;
  displayName?: string;
  email?: string;
  plan?: string;
  sessionSync?: boolean;
  listAllModels?: boolean;
  hideUnroutedModels?: boolean;
  /** Code 页签是否和命令行共用 ~/.claude。 */
  codeShareHome?: boolean;
  /** 启动前把命令行建的会话加进 Desktop 的会话列表。 */
  importCliSessions?: boolean;
};

export type ClaudeStatus = {
  supported: boolean;
  sourceApp: string;
  version: string;
  claudeRunning: boolean;
  running: boolean;
  localProcess?: boolean;
  connected: boolean;
  port?: number | null;
  caReady: boolean;
  caTrusted: boolean;
  caMachineSupported: boolean;
  caMachineTrusted: boolean;
  /** 内嵌的录制版本，新的在前。builtAt 是该版本前端的构建时间（秒）。 */
  templates?: Array<{ build: string; builtAt: number | null }>;
  nodeAvailable: boolean;
  /** 这个构建是否带本地听写（GNU 工具链构建可以关掉）。 */
  dictationSupported?: boolean;
  dictationReady: boolean;
  config: ClaudeConfig;
  models: string[];
  contextWindow?: number | null;
  warning?: string | null;
  needsRestart: boolean;
};

export const SOURCE_LABELS: Record<string, string> = {
  manual: "手动",
  ccswitch: "cc-switch",
  magpie: "Magpie",
  codexpp: "Codex++",
};

export const IMPORT_SOURCES: Array<{ id: UpstreamSource; label: string; detail: string }> = [
  { id: "ccswitch", label: "cc-switch", detail: "导入 cc-switch 里的 Claude 供应商" },
  { id: "magpie", label: "Magpie", detail: "把 Magpie 的本机网关当上游" },
  { id: "codexpp", label: "Codex++", detail: "把 Codex++ 的本机网关当上游" },
];

export function emptyProfile(): UpstreamProfile {
  return { id: "", name: "", baseUrl: "", apiKey: "", model: "", smallModel: "", models: [], contextWindow: null, modelNames: {}, routes: [], source: "manual", sourceId: "" };
}

export function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url.trim();
  }
}

/** 表单校验：返回第一条问题，没有问题返回 null。 */
export function profileProblem(profile: UpstreamProfile): string | null {
  const base = profile.baseUrl.trim();
  if (!base) return "填一个 Base URL";
  let parsed: URL;
  try {
    parsed = new URL(base);
  } catch {
    return "Base URL 不是有效地址";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "Base URL 要以 http:// 或 https:// 开头";
  if (/\/v1\/messages\/?$/.test(parsed.pathname)) return "Base URL 只写到根地址，不要带 /v1/messages";
  if (!profile.model.trim()) return "选一个默认模型";
  // 映射：官方 ID 必须是 Claude 身份，且不能重复（选择器里 ID 必须唯一）。
  // 没填实际模型的行不参与校验，先把角色配置留住。
  const seen = new Set<string>();
  for (const route of profile.routes ?? []) {
    const id = route.id.trim();
    if (!id || !route.target.trim()) continue;
    if (!/^claude-[a-z0-9][a-z0-9.-]*(?:\[1m\])?$/.test(id)) {
      return `映射里的官方模型 ID「${id}」不对，应形如 claude-sonnet-5-5`;
    }
    if (seen.has(id)) return `有两个角色都指向了 ${id}，请换一个官方模型`;
    seen.add(id);
  }
  return null;
}

/** 列表去重、去空白，默认模型排第一。 */
export function normalizeModels(models: string[], primary = ""): string[] {
  const out: string[] = [];
  for (const raw of [primary, ...models]) {
    const model = raw.trim();
    if (model && !out.includes(model)) out.push(model);
  }
  return out;
}

/**
 * 保存前的映射表：留下填了官方 ID 的行（实际模型可以为空，表示这个角色不用）；
 * 同一角色只保留最后一条，字段去空白。
 */
export function normalizeRoutes(routes: ModelRoute[]): ModelRoute[] {
  const out: ModelRoute[] = [];
  for (const route of routes ?? []) {
    const id = route.id.trim();
    if (!id) continue;
    const slot = (route.slot.trim() || slotOf(id));
    const entry = { slot, id, target: route.target.trim(), name: route.name.trim(), supports1m: Boolean(route.supports1m) };
    const index = out.findIndex((known) => known.slot === slot);
    if (index >= 0) out[index] = entry;
    else out.push(entry);
  }
  return out;
}

export type Tone = "ok" | "warn" | "off" | "busy";

/** 顶部状态条：一句话 + 色调。 */
export function claudeState(status: ClaudeStatus | null, busy: string | null): { text: string; tone: Tone } {
  if (busy === "launch") return { text: "正在启动…", tone: "busy" };
  if (busy === "stop") return { text: "正在停止…", tone: "busy" };
  if (!status) return { text: "正在检测 Claude…", tone: "busy" };
  if (!status.supported) return { text: "没有找到 Claude Desktop", tone: "warn" };
  if (status.connected) return { text: "已连接", tone: "ok" };
  if (status.claudeRunning && status.localProcess) return { text: "运行中", tone: "ok" };
  if (status.claudeRunning) return { text: "Claude 已打开，但没有经 ClaudeMom 启动", tone: "warn" };
  if (status.running) return { text: "本地服务已就绪", tone: "ok" };
  return { text: "未启动", tone: "off" };
}

/** 启动前还差什么：按顺序列出，界面逐条给按钮。 */
export function setupSteps(status: ClaudeStatus | null, active: UpstreamProfile | null): Array<{ id: "upstream" | "node" | "trust"; text: string }> {
  if (!status || !status.supported) return [];
  const steps: Array<{ id: "upstream" | "node" | "trust"; text: string }> = [];
  if (!active || profileProblem(active)) steps.push({ id: "upstream", text: "先添加一组上游并选好默认模型" });
  if (!status.nodeAvailable) steps.push({ id: "node", text: "需要 Node.js（支持 fetch 与 WebSocket 的版本）" });
  // 第三方模式下 Claude 不经代理，不需要信任本地证书。
  if (!status.caTrusted && !status.config.threePMode) steps.push({ id: "trust", text: "首次使用需要信任本地证书" });
  return steps;
}

export const WINDOW_PRESETS: Array<{ value: number | null; label: string }> = [
  { value: null, label: "不声明（200k）" },
  { value: 200_000, label: "200k" },
  { value: 400_000, label: "400k" },
  { value: 1_000_000, label: "1M" },
];

export function formatWindow(value: number | null | undefined): string {
  if (!value) return "200k";
  if (value >= 1_000_000) return `${+(value / 1_000_000).toFixed(1)}M`;
  return `${Math.round(value / 1000)}k`;
}

export function isOk(result: { status: CommandStatus }): boolean {
  return result.status === "ok";
}

/** 录制版本的显示：前端构建日期 + build id，例如「2026-11-14 · a4ced7f85b」。 */
export function templateLabel(template: { build: string; builtAt: number | null }): string {
  if (!template.builtAt) return template.build;
  const date = new Date(template.builtAt * 1000);
  const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return `${day} · ${template.build}`;
}
