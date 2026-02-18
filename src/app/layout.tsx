import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YouTube Shorts Republisher | Automated Video Management",
  description: "Automated YouTube Shorts reposting tool with Supabase backend. Schedule, manage, and auto-upload shorts with AI enhancement.",
  keywords: ["YouTube Shorts", "Automation", "Video Uploader", "Supabase", "Content Republishing", "AI Enhancement"],
  authors: [{ name: "YouTube Shorts Republisher" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "YouTube Shorts Republisher",
    description: "Automated YouTube Shorts reposting tool with AI enhancement",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "YouTube Shorts Republisher",
    description: "Automated YouTube Shorts reposting tool with AI enhancement",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${inter.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange={false}
        >
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
