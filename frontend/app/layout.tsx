import type {Metadata} from 'next';
import './globals.css';
import { Fira_Sans, Fira_Code } from "next/font/google";
import { cn } from "@/lib/utils";
import { Providers } from './providers';

const firaSans = Fira_Sans({
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Sesame Gateway',
  description: 'Enterprise AI Gateway Management',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="zh" className={cn("font-sans", firaSans.variable, firaCode.variable)} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
