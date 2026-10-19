import type { FC } from 'hono/jsx';
import { Icon } from './DashboardSurface';
import { FieldInput } from './Controls';

export const TelegramSettings: FC<{ active?: boolean }> = ({ active = false }) => (
    <section id="telegramPage" class="route-page" hidden={!active}>
        <div class="workspace-heading"><div><h1>Telegram</h1><p>连接机器人，接收订阅通知并通过命令管理订阅。</p></div></div>
        <div class="page-body settings-content">
            <section class="settings-section" aria-labelledby="telegramDeliveryTitle">
                <div class="section-heading"><h4 id="telegramDeliveryTitle">推送设置</h4><p>填写 Bot Token 和接收消息的 Chat ID。</p></div>
                <form id="telegramConfigForm" class="form-stack" method="post">
                    <div class="form-group">
                        <label for="botToken" class="form-label">Bot Token</label>
                        <div class="secret-field"><FieldInput type="password" id="botToken" class="input-field" placeholder="从 @BotFather 获取" spellcheck="false" aria-describedby="botTokenHint" /><button type="button" class="secret-toggle icon-btn" data-toggle-secret="botToken" aria-label="显示 Bot Token" aria-pressed="false"><Icon name="eye" /></button></div>
                        <span id="botTokenHint" class="form-hint">在 Telegram 中向 @BotFather 创建机器人后获取。</span>
                    </div>
                    <div class="form-group">
                        <label for="chatId" class="form-label">Chat ID</label>
                        <FieldInput type="text" id="chatId" class="input-field" placeholder="接收消息的用户或群组 ID" spellcheck="false" aria-describedby="chatIdHint" />
                        <span id="chatIdHint" class="form-hint">开启命令交互后，向 Bot 发送 /start 即可自动绑定。</span>
                    </div>
                    <div class="preference-list">
                        <label class="switch-row" for="stopPush"><span><span class="switch-label">暂停推送</span><span class="form-hint">暂停所有通知，订阅和配置会保留。</span></span><FieldInput type="checkbox" role="switch" id="stopPush" class="switch-input" /></label>
                        <label class="switch-row" for="onlyTitle"><span><span class="switch-label">仅匹配标题</span><span class="form-hint">只在帖子标题中查找订阅关键词。</span></span><FieldInput type="checkbox" role="switch" id="onlyTitle" class="switch-input" /></label>
                    </div>
                    <div class="form-actions"><button type="button" id="testTelegramBtn" class="btn btn-secondary"><Icon name="send" />测试推送</button><button type="submit" class="btn btn-primary">保存配置</button></div>
                </form>
            </section>
            <section class="settings-section" aria-labelledby="telegramInteractionTitle">
                <div class="section-heading"><h4 id="telegramInteractionTitle">命令交互</h4><p>通过 Bot 查看帖子、管理订阅和暂停通知。</p></div>
                <fieldset class="mode-fieldset"><legend class="form-label">连接方式</legend>
                    <div class="mode-selector" id="telegramModeSelector">
                        <label class="mode-option"><FieldInput type="radio" name="telegramMode" value="disabled" checked /><span class="mode-label"><Icon name="pause" />关闭</span></label>
                        <label class="mode-option"><FieldInput type="radio" name="telegramMode" value="polling" /><span class="mode-label"><Icon name="sync" />Polling</span></label>
                        <label class="mode-option"><FieldInput type="radio" name="telegramMode" value="webhook" /><span class="mode-label"><Icon name="send" />Webhook</span></label>
                    </div>
                </fieldset>
                <div id="disabledModePanel" class="mode-panel"><p class="form-hint">停用 Bot 命令交互后，已配置的消息推送仍可使用。</p><button type="button" id="disableTelegramBtn" class="btn btn-secondary">停用命令交互</button></div>
                <div id="webhookModePanel" class="mode-panel" style="display:none">
                    <form id="webhookConfigForm" class="form-stack" method="post">
                        <div class="form-group"><label for="webhookUrl" class="form-label">Webhook URL</label><FieldInput type="url" id="webhookUrl" class="input-field" placeholder="https://your-domain.com/telegram/webhook" spellcheck="false" /><span class="form-hint">使用 HTTPS 公网地址，Telegram 会向此地址发送命令。</span></div>
                        <div class="form-actions"><button type="button" id="testWebhookBtn" class="btn btn-secondary">测试连接</button><button type="button" id="clearWebhookBtn" class="btn btn-danger">清除</button><button type="submit" class="btn btn-primary">保存 Webhook</button></div>
                    </form>
                </div>
                <div id="pollingModePanel" class="mode-panel" style="display:none"><p class="form-hint">主动从 Telegram 获取命令，适用于没有公网地址的环境。</p><div id="pollingStatusIndicator" class="inline-status">Polling 未运行</div><div class="form-actions"><button type="button" id="startPollingBtn" class="btn btn-primary">启动 Polling</button><button type="button" id="stopPollingBtn" class="btn btn-danger" style="display:none">停止 Polling</button></div></div>
            </section>
            <section id="telegramStatusPanel" class="settings-section" aria-labelledby="telegramStatusTitle">
                <div class="section-heading"><h4 id="telegramStatusTitle">连接状态</h4></div>
                <dl class="connection-status"><div><dt><Icon name="send" />Bot 连接</dt><dd id="telegramBotStatus">检查中</dd></div><div><dt><Icon name="sync" />Webhook</dt><dd id="telegramWebhookStatus">检查中</dd></div><div><dt><Icon name="user" />账号绑定</dt><dd id="telegramBindingStatus">检查中</dd></div></dl>
            </section>
        </div>
    </section>
);
