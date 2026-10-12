import './globals.css';

export const metadata = {
  title: 'FRANXX PTERO — Control Panel',
  description: 'FRANXX PTERO custom server and runtime control panel.',
  applicationName: 'FRANXX PTERO',
  icons: { icon: 'https://zfile.web.id/PBe7sdw.png' },
  themeColor: '#0a0a12'
};

export default function RootLayout({ children }) {
  return <html lang="id"><body>{children}</body></html>;
}
