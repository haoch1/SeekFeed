import type { FC } from 'hono/jsx';
import { FieldInput } from './Controls';
import { Icon } from './DashboardSurface';

export const AccountSettings: FC<{ active?: boolean }> = ({ active = false }) => (
    <section id="accountPage" class="route-page" hidden={!active}>
        <div class="workspace-heading"><div><h1>账号与安全</h1></div></div>
        <div class="settings-content page-body">
            <section class="settings-section">
                <div class="section-heading"><h2>账号信息</h2><p>修改账号需要验证当前密码，保存后请重新登录。</p></div>
                <form id="accountForm" class="form-stack" method="post">
                    <div class="form-group"><label class="form-label" for="accountUsername">用户名</label><FieldInput id="accountUsername" class="input-field" required minlength="3" maxlength="50" spellcheck="false" /></div>
                    <div class="form-group"><label class="form-label" for="accountCurrentPassword">当前密码</label><FieldInput id="accountCurrentPassword" type="password" class="input-field" required maxlength="50" /></div>
                    <div class="form-group"><label class="form-label" for="accountNewPassword">新密码</label><FieldInput id="accountNewPassword" type="password" class="input-field" minlength="8" maxlength="50" placeholder="不修改密码时留空" /><span class="form-hint">8–50 个字符，建议使用随机生成的强密码。</span></div>
                    <div class="form-group"><label class="form-label" for="accountConfirmPassword">确认新密码</label><FieldInput id="accountConfirmPassword" type="password" class="input-field" minlength="8" maxlength="50" placeholder="再次输入新密码" /></div>
                    <div class="form-actions"><button class="btn btn-primary" type="submit">保存账号信息</button></div>
                </form>
            </section>
            <section class="settings-section">
                <div class="section-heading"><h2>登录有效期</h2><p>从每次登录时开始计算。更改后对新登录的会话生效。</p></div>
                <form id="sessionSettingsForm" class="form-stack" method="post">
                    <div class="form-group"><label class="form-label" for="sessionHours">保持登录</label><select id="sessionHours" class="input-field" data-1p-ignore="true" data-op-ignore="true"><option value="1">1 小时</option><option value="24">1 天</option><option value="168">7 天</option><option value="720">30 天</option></select></div>
                    <div class="form-actions"><button class="btn btn-primary" type="submit">保存有效期</button></div>
                </form>
            </section>
            <section class="settings-section account-devices">
                <div class="section-heading"><h2 id="sessionsTitle">登录设备</h2><p>最多保留 5 个活跃会话。退出所有设备后，需要重新登录。</p></div>
                <div id="sessionsList" class="sessions-list" aria-live="polite" tabindex="0" role="region" aria-labelledby="sessionsTitle"></div>
                <div class="form-actions"><button id="logoutAllBtn" class="btn btn-danger" type="button"><Icon name="logout" />退出所有设备</button></div>
            </section>
        </div>
    </section>
);
