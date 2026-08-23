# 开发执行加速器全链路强化设计

## 状态

- 日期：2026-08-21
- 需求版本：2026-08-23 Task 9 交付证据收敛
- 状态：核心 Skill 目标与字节不变；评测交付路径已收敛，等待精简执行器评审
- Skill：`development-execution-accelerator`
- 实施分支：`codex/development-execution-accelerator`
- 定位：消费既定决策、只优化长任务开发执行链路的通用 Agent Skill

本文取代 `2026-08-19-development-execution-accelerator-design.md` 中关于触发范围、执行模式、速度评测、证据状态和成熟交付的设计。旧规格中未冲突的安全边界继续有效。旧实施计划不再用于受影响工作；本规格通过书面评审后生成新的实施计划。

## 唯一目标

在不改变任务目标、业务逻辑、架构决策、范围和验收标准的前提下，缩短已经决断的长任务开发墙钟时间。提速只来自以下机制：

1. 并行执行真正独立的实现工作。
2. 在长命令等待期间完成不依赖其结果的既定工作。
3. 把改动影响面映射到最小充分验证。
4. 复用输入身份仍有效的验证结果。
5. 消除重复扫描、重复回归、忙轮询、无收益分派和证据整理等无用操作。

正确性是不可交换的硬门。跳过必跑测试、削弱断言、改变业务行为、扩大或缩小任务范围取得的时间优势无效。

## 职责边界

本 Skill 不负责架构、需求、范围、公共接口、模块边界或项目任务规划。它只读取用户、项目规则以及其他规划或架构 Skill 已经确定的执行契约。

若缺失信息只影响调度，选择最保守的执行顺序。若缺失信息会改变业务行为、接口、边界、范围或验收口径，把问题返回上游；本 Skill 不自行补齐决断。

本 Skill 不是构建系统、缓存服务、项目任务规划器、常驻调度器或平台专属适配器。运行时交付继续保持 Markdown-only，唯一运行时 payload 为 `SKILL.md`。

## 长任务准入与触发

### 元数据选择

description 自动面向已经决断的长时间编码、修复、重构、测试、迁移、构建或配置实施任务触发。它不再宣称覆盖所有软件项目执行任务。

以下请求不应触发：

- 单步、短时、单文件且没有昂贵验证链的普通修改。
- 架构、需求、范围或项目任务规划仍未决的请求。
- 纯解释、状态查询或只读代码评审。
- 用户明确要求串行观察、逐步演示或禁止并行的请求。

### 运行时准入

Skill 被显式调用或元数据无法完全判断时，先用已有上下文做一次轻量任务形状检查。满足以下至少一项才进入加速链路：

1. 至少两个中等规模、依赖和冲突域独立的既定实现工作面。
2. 存在耗时命令，且命令运行期间有不依赖其结果的既定工作和足够的可利用剩余时间。
3. 存在多阶段长关键路径，可通过精准验证、有效结果复用或局部失败恢复避免明显重复工作。

中等规模工作必须包含有意义的实现和验证，不能用极小表达式修改、人工 `sleep`、证据文件写入或其他玩具动作制造并行收益。

不满足准入条件时立即退出加速链路。此退出不探测 worker、background、wait 或 plan-state 能力，不创建执行状态，也不增加额外验证。

## 不变量与执行契约

进入加速链路前，锁定以下不可改变的上游事实：

- 任务目标和完成条件。
- 依赖顺序和不可并行约束。
- 允许修改的文件、模块和冲突域。
- 必须保持的行为、接口和兼容要求。
- 有顺序要求的必跑测试、构建、格式化、安全或交付门禁。
- 当前工作树中不属于本任务的已有改动。

任何加速策略都不得改变这些事实。每个冲突域只能有一个 writer；并行度不能通过重复调查、重复实现或拆分强耦合修改来制造。

## 自适应提速链路

### 顺序优化路径

长任务没有可安全并行的实现工作时，由主 Agent 沿关键路径执行，但仍使用精准验证、结果复用和局部失败恢复。该路径不为形式上的并行启动 worker。

### 并行开发路径

只有至少两个中等规模、冲突域独立的既定实现工作面时才启动 worker。每个 worker 获得目标、允许写入范围、依赖、完成条件和必须返回的验证证据。一个冲突域只分配一个 writer，主 Agent 负责调度、整合和最终统一 gate。

报告必须区分：

- 真实 worker 并行实现。
- 主 Agent 实现与后台验证的等待重叠。
- 完全顺序执行。

不得把后台测试、并发读取或计划中的 worker 描述为已经发生的并行开发。

### 等待重叠路径

启动后台命令前，先准备好一个不依赖该命令结果的既定动作。session 返回后确认命令仍在运行，然后立即执行该独立动作。在完成这个动作前，不得整理 evidence、轮询或再次 wait。

如果 session 返回时命令已经结束，则降级为顺序结果，不声明 overlap。只有预计剩余时间明显大于一次 Agent/tool 往返时间和安全余量时，才采用等待重叠；临界的数十或数百毫秒不计为稳定收益。

后台命令记录命令、工作目录、输入身份、session 和控制器时间戳。依赖其结果的工作仍须等待，不能通过投机执行缩短表面时间。

## 精准验证与结果复用

### 不可删减的验证下界

上游必跑验证是不可删减且按约定顺序执行的下界。Skill 可以在顺序允许且资源不冲突时重叠检查，但不能把“尚未运行”解释为“不需要运行”。最终统一 gate 只在独立实现和 focused tests 完成后运行一次。

### 输入身份

每个可复用验证结果至少绑定：

- 规范化命令和工作目录。
- 会影响结果的改动、配置、依赖清单与锁文件身份。
- 与项目规则相关的环境身份。
- 结果、完成时间和所处验证顺序。

身份记录优先复用 Agent 上下文、上游状态或项目原生缓存信息，不为此扫描无关仓库或创建常驻状态目录。

### 去重和失效

同一任务中，相同命令和相同输入身份只消费一个有效结果。成功后的同条件重复运行应被消除。失败后只失效受失败分支或后续修改影响的结果；不相关分支的成功结果继续有效。

以下变化才扩大失效范围：共享基础、依赖传播、相关配置或锁文件、必跑 gate 输入、环境身份。无法可靠判断影响面时采用项目现有聚合命令，不猜测更窄范围。

### 最短失败回路

优先修复最早失败的局部分支并重跑已失效的 focused check。除非共享输入或交付 gate 已改变，不重复已经通过的独立 focused check。不得无新假设地重复相同失败命令。

## Prompt 与资源边界

`SKILL.md` 保持单文件运行时设计，不增加平台专属 runtime script、adapter 或默认 references。评测控制器和 Gate 属于仓库开发工具，不进入 Skill 运行时 payload。

Prompt 的硬上限仍为 2500 tokens，成熟交付的保守目标为不超过 2250 tokens，留下至少 250 tokens 的维护余量。不得通过删除安全边界、验证下界、职责边界或真实报告要求换取预算。

`references`、`scripts` 和 `assets` 轨道默认继续 `disabled`；只有独立证据证明它们能降低时间或错误且不会增加运行时耦合时，才另行启用。

## Delivery Gate 与证据契约强化

### 总不崩溃规则

Delivery Gate 对任何仓库输入都必须返回结构化诊断，而不是抛出未捕获异常。artifact 处理顺序固定为：读取原始字节、校验 SHA-256、严格解码、规范化仅用于语义解析的文本、解析字段、验证状态。

- CRLF 和单个前导 UTF-8 BOM 应可被安全解析，但原始字节 hash 不改变。
- NUL、非法 UTF-8、无法解析的文本或缺失字段返回类似 `GATE_EVAL_ARTIFACT_TEXT_INVALID` 的稳定诊断。
- 正则不匹配、捕获组缺失和空字段都走显式错误分支，不允许空值解引用。
- CLI 可以用非零退出码表示未通过，但必须先完整输出诊断报告。

以上行为全部先以失败测试覆盖 CRLF、BOM、NUL、非法 UTF-8、缺字段和任意临时仓库输入。

### 评测状态真实性

- `not-run`：没有实际运行，evidence 必须为空；Gate 只报告 NOT_PASS。
- `fail`：已经运行且断言失败，必须绑定 artifact 和 SHA-256。
- `pass`：所有断言通过，必须绑定 artifact、SHA-256 和最终 `SKILL.md` hash。

EVAL-008 已实际运行三次且 overlap 断言三次失败，因此实施开始时必须由 `not-run` 更正为 `fail` 并绑定现有失败 artifact。不得继续把失败证据描述为未运行。

REQ-002 的旧计时包含错误 UTC 标记和不可接受的配对启动偏差，恢复为待测状态。REQ-003、REQ-004、REQ-006 和 `multi-agent` 保持阻塞，直到新的当前字节证据解除条件。

Brief 的 `pending` 可以在 Delivery Report 映射为 `blocked`。为避免把原因藏在 prose 中，Delivery Report 的 blocked requirement 必须新增非空 `blocker` 和 `unblock_condition`，pass requirement 不得携带这两个字段；Validator 和 Gate 用 TDD 同步升级该契约。

### 状态摘要

`.scaffold/state.json#initial_files` 保留初始化来源证明和必需文件集合，不再把正常编辑的 Skill 交付文件永久报告为 `STATE_DIGEST_DRIFT`。实现应区分：

- 按语义契约验证的可编辑交付文件，如 `SKILL.md`、Brief、README、评测和报告。
- 仍需字节级保护的不可变初始化文件，如未获授权不得变化的许可证。

文件缺失、越界路径、非法 hash 和不可变文件漂移仍必须报告。该调整不得通过刷新 initial digest 来伪造“从未修改”。

### 包语义

README 和检查器统一说明：唯一运行时 payload 是 `SKILL.md`；实际 npm archive 固定包含 npm 自动加入的 `LICENSE`、`README.md`、`package.json` 以及声明的 `SKILL.md`。测试以 `npm pack --dry-run --json` 的实际清单为准，禁止把“运行时 payload”误写成“archive 只有一个文件”。

所有 `enabled` 或 `blocked` 轨道必须绑定当前状态和当前 Skill hash 对应的证据；历史 artifact 只能标为回归参考。为保持字段含义明确，轨道证据语法固定为：

- `enabled`：使用 artifact 引用，artifact 内记录与当前文件一致的 Skill SHA-256。
- `blocked`：保留 `required:<work>;impact:<delivery-impact>`，并追加 `skill-sha256:<64 lowercase hex>`；`unblock_condition` 继续单独记录解除条件。
- `disabled`：记录非空禁用理由，不要求 Skill hash。

Validator 和 Gate 必须拒绝缺失、历史或与当前 `SKILL.md` 不一致的 enabled/blocked hash。

## 精简原生 JSONL 评测

2026-08-23 复核确认，过度扩张的是交付与评测路径，不是 Skill 行为。当前 `SKILL.md` 字节、唯一目标、20% 长任务门槛、一个冲突域一个 writer 与零探测短任务边界全部保持不变。旧 ACK bridge、hash-chain ledger、敌对文件系统事务、campaign rollover/recovery 与 48+ subject 设计不再继续；历史尝试保留为已取代证据。

每个 subject 使用一个全新的本地 `codex exec --json` 进程，固定模型 `gpt-5.6-sol`、推理档位 `high`、`workspace-write` sandbox，并默认禁用网络。stdout 原始字节直接写入新建 attempt 目录中的 JSONL 文件，进程退出后才解析；同时保存退出状态和 stderr。目录已存在即失败，失败或无效 attempt 原样保留，禁止恢复、清理后复用或拼接旧输出。

with-Skill subject 只在仓库级 `.codex/skills/development-execution-accelerator/SKILL.md` 暴露当前 Skill；without-Skill subject 不含任何 accelerator payload，并通过同一个 `skills.config` 同时禁用用户级 `.agents` 与 `.codex` 同名 Skill 目录。三个 long pair 的任务 prompt 必须逐字节相同且保持中性，不出现 Skill、worker、parallel 或 serial 提示。显式短任务 subject 单独运行，不设 baseline；explicit-serial long near miss 检查隐式不触发和零加速探测。执行器不复制现有 analyzer、recovery 或通用 identity 框架，只负责新目录、启动、原始输出保存和后验客观验证/摘要。

每个被接受的 Skill 字节版本只运行一个全新、固定顺序的 11-subject campaign：1 个关闭 multi-agent 的非计分 with-Skill foreground-fallback pilot、3 个长任务 with/without pair（6 个进程，顺序交错）、1 个显式 `$development-execution-accelerator` 短任务 subject、1 个 wait-overlap、1 个 implicit-positive discovery、1 个 explicit-serial long near miss discovery。pilot 永不进入性能统计；不得启动第 12 个进程。本 setup round 只实现并测试执行器，不运行任何真实 subject 或 pilot。

原生 JSONL 事件和最终文件状态共同承担证据：命令、worker/session 生命周期按流中顺序验证；正确性、允许 diff、focused check 与 aggregate gate 顺序在进程结束后机械检查。真实 overlap 要求有用实现或测试动作的开始和结束都严格位于目标长命令区间内；Agent 自述和事后 note 不能代替事件。短任务显式加载 trace 必须没有 worker、background、wait 或 plan-state probe。

### 同条件质量门

Skill 与无 Skill 对照都从同一冻结 fixture 创建独立工作区，使用相同模型、推理档位、任务、sandbox、资源限制、输入文件和验收命令。所有组遵守相同的实现与验证顺序；不得让 baseline 跳过强制 RED/GREEN 或人为限制其策略。旧 draft 不再占用精简样本配额。

每个计时结果只有在以下条件全部通过时才有效：

- 业务输出和允许的 diff 与任务契约一致。
- 两个 focused tests 和最终统一 gate 按相同规则通过。
- 没有削弱测试、跳过验证、越界修改或破坏已有改动。
- trace、计时、Git 状态和最终响应证据完整。

### 代表性长任务

REQ-003 的代表 fixture 包含两个中等规模、冲突域独立的真实实现任务。每个任务拥有自己的实现文件、测试修改和 focused test，完成后运行一次统一 gate。fixture 使用真实计算、I/O、构建或测试工作，不用人工 `sleep` 主导结果，也不用极小表达式修改代表实现成本。

有 Skill 组必须实际调用独立 worker 完成两个实现工作面；只有主 Agent 加后台测试重叠不能证明子 Agent 并行开发收益。无 Skill baseline 保持正常自主执行，不强制使用或禁用其自然策略。

### 长任务配对与边界样本

- 成熟速度门只与完全不加载本 Skill 的 baseline 比较。
- 先运行一个关闭 multi-agent 且不计分的 with-Skill pilot，检查 foreground fallback、启动、原始 JSONL、fixture 和验收规则；无论结果如何都不进入性能统计。
- pilot 接受后运行三个正式 long pair，按 with/without、without/with、with/without 交错；同一 pair 不并发争抢机器资源。
- 有效慢样本和质量失败样本均占固定位置；基础设施无效 attempt 保留，但不得恢复或复用其目录。
- 三个 long pair 完成后停止长任务采样，不追加样本刷结果。
- REQ-002 只运行一个显式加载的 with-Skill short subject，证明零探测且不建立加速状态；不设 short baseline，也不形成 wall-clock 或统计成熟声明。
- wait-overlap 与两个 discovery subject 各运行一次，分别固定真实重叠、隐式正向选择和显式串行/短近失选择边界。

### 成熟速度门

REQ-003 只有在三个正式有效 pair 中同时满足以下条件才通过：

- 所有质量门通过。
- 相对无 Skill baseline 的中位墙钟时间降低至少 20%。
- 一个 writer 对应一个冲突域。
- 外部 trace 证明实际 worker 并行。

REQ-002 是非长任务选择和准入保护：description 应拒绝短任务；若被显式调用，运行时准入应零 worker、background、wait 和 plan-state probe 地退出且不建立执行状态。单个显式 short subject 只证明本次边界未回归，不用于配对计时、统计泛化或延迟成熟声明。

EVAL-008 只有在原生 JSONL 证明真实 wait-overlap、质量门通过且命令未重复时才通过。单次通过是有界能力证据，不宣称稳定性分布。

## TDD 与实现约束

精简执行器的确定性行为严格遵循 RED、GREEN、REFACTOR，不使用子 Agent、reviewer 或 helper。真实 Skill 行为仍必须由后续授权的 subject 评测固定，静态测试不能替代 Agent 结论。

代码写入前加载 `chinese-code-comments` 并固定 `SCOPED`。实现时只记录并发、证据、解码、资源和兼容性等非直观维护意图；结束前审查完整 diff 和未跟踪交付文件中的注释。

## 实施范围与顺序

新的实施计划至少覆盖以下任务：

1. 先登记需求收窄、纠正 EVAL-008 和 REQ-002 的真实状态。
2. 以 TDD 修复 Gate 的任意输入崩溃、文本解码和状态证据契约。
3. 以 TDD 消除可编辑交付文件的永久 digest drift，并固定 npm archive 语义。
4. 重写 `SKILL.md` 的长任务准入、并行、wait-overlap、精准验证和报告协议，控制在 2250 tokens 内。
5. 更新正向、负向、边界和失败评测，以及两个中等规模独立任务的代表 fixture。
6. 以 TDD 实现只负责新目录、`codex exec --json` 启动、原始输出保存和后验验证/摘要的精简执行器。
7. 经新评审批准后，在 11-process 硬上限内运行样本并更新 Brief、Evidence Contract、Delivery Report、README 和全部 artifact hash。
8. 执行完整检查、独立终审、合并、全局安装和发现烟测。

## 本地可用交付与扩展认证

本地可用交付是本请求的阻塞完成轨道，不改变运行时 Skill、正式评测、成熟阈值或历史审计的含义。获得明确安装授权后，本地轨道要求：运行时 `SKILL.md` 字节不变；仓库检查和 Validator 通过；当前内容干净；npm 包白名单精确；安装过程安全且可恢复；并在全新 Agent 上完成发现和行为烟测。未实际完成安装和烟测前，不得声明本地交付完成。

扩展认证不阻塞本地可用交付：固定 11-subject 原生 Codex campaign、REQ-003 相对无 Skill baseline 的 20% paired-median 门槛，以及由此得出的任何量化提速声明，仍须保持原有证据标准。完整 Git 历史审计和历史无私有路径的声明仍是公开发布或 history-clean 声明的门槛。两条轨道都不得通过降低阈值、改写历史、弱化扫描器或重标现有 blocked 状态来达成。

## 成熟交付标准

只有以下条件全部满足才声明成熟：

- REQ-001 至 REQ-006 全部为 `pass`。
- REQ-003 三个正式有效 pair 相对无 Skill baseline 的中位提速至少 20%。
- REQ-002 的单个显式 short subject 证明零加速能力探测和零状态建立，并明确没有 baseline 或统计性质。
- EVAL-008 有原生 JSONL 证明真实 overlap。
- `npm run check`、审计、快速验证器和 `npm run gate:delivery` 全部通过。
- Prompt 保守预算不超过 2250/2500。
- Evidence Contract 的状态、artifact、SHA-256 和最终 Skill hash 一致。
- 完整 diff、未跟踪文件、安全、敏感信息、包白名单和代码注释审查通过。
- 新的独立终审不存在 Critical 或 Important 问题。

未达到 20%、缺少真实 worker/overlap trace、证据不完整或质量不等价时，保持 draft/blocked。不得降低阈值、串行化 baseline、替换有效慢样本或追加样本刷结果。

## 合并、安装与恢复

本地轨道的检查和明确安装授权满足后，即可在扩展认证仍 blocked 时执行安全本地安装；成熟门禁全部通过仍是成熟交付、量化提速声明和公开发布准备的前提。合并到运行时由 `git rev-parse --show-toplevel` 和 Git worktree 元数据解析出的默认主工作树前，检查两个工作树的状态，不覆盖用户改动，不使用强制重置。

全局安装的唯一目标为：

`Join-Path ([Environment]::GetFolderPath('UserProfile')) '.agents\skills\development-execution-accelerator'`

安装先复制到临时目录，验证文件清单、frontmatter、hash 和检查结果，再替换精确目标。检查并移除其他全局 Skill 根中的同名副本，Git 提交作为恢复来源；不得删除无关 Skill。

安装后在全新 Agent 上下文执行发现烟测，并在隔离 fixture 上验证一个真实长任务会触发该 Skill、保持业务语义、使用并行开发和精准验证。发现或行为烟测失败时恢复安装前状态，不声明完成。

本轮不执行 push、Tag、Release、包注册表上传、公开发布、凭据使用或付费调用。

## 需求追踪

| 需求 | 强化后的验收含义 | 主要证据 |
| --- | --- | --- |
| REQ-001 | 只自动选择已经决断的长任务，拒绝短任务与职责外请求 | description 对抗选择 + 真实 Agent 正负案例 |
| REQ-002 | 显式非长任务零探测、零状态退出；不作计时声明 | 一个原生 JSONL subject |
| REQ-003 | 两个中等规模独立实现由真实 worker 并行，一个冲突域一个 writer，中位提速至少 20% | 三个正式 pair + 原生 JSONL + diff/test |
| REQ-004 | 必跑验证不减少，同输入不重复，局部失败只失效相关结果 | 命令 trace + 输入身份 + focused/full gate |
| REQ-005 | 能力不足时安全降级且仍保持精准验证 | 关闭 multi-agent 的非计分 foreground-fallback pilot 加 explicit-serial long near miss；两者均不进入性能统计，且没有第 12 个进程 |
| REQ-006 | 核心协议平台中立，正式支持声明只来自真实发现和运行证据 | 能力协议评测 + 当前 hash artifact |

## 规格自审清单

- 没有待定占位符或未解释的成熟门槛。
- 唯一目标、触发范围、执行行为、评测方法和安装条件互相一致。
- 开发工具脚本与 Markdown-only 运行时边界明确。
- 所有已知失真状态都有修复顺序和失败语义。
- 新设计没有接管架构或规划职责。
- 未授权的发布、凭据和付费操作明确排除。
