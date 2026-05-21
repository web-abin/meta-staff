import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "../lib/user";
import { I18nProvider } from "../lib/i18n";
import { ThemeProvider } from "../lib/theme";

export const metadata: Metadata = {
  title: "meta-staff · 数字员工协作工作流",
  description: "把数字员工组合成可执行的工作流，AI 干重复活儿，人类把关关键节点。",
};

const INIT_SCRIPT = `(() => {
  try {
    var t = localStorage.getItem('meta-staff:theme');
    var l = localStorage.getItem('meta-staff:locale');
    document.documentElement.setAttribute('data-theme', t === 'dark' ? 'dark' : 'light');
    document.documentElement.setAttribute('lang', l === 'en' ? 'en' : 'zh-CN');
  } catch (e) {}
})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" data-theme="light" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INIT_SCRIPT }} />
      </head>
      <body>
        <ThemeProvider>
          <I18nProvider>
            <UserProvider>{children}</UserProvider>
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
