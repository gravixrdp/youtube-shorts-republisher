import type { Metadata } from "next";
import { DM_Sans, Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GRAVIX — YouTube Shorts Automation",
  description:
    "Automate YouTube Shorts republishing with smart mapping, scheduling controls, and AI-assisted enhancements.",
  keywords: ["YouTube Shorts", "Automation", "Video Uploader", "Content Republishing", "AI Enhancement"],
  authors: [{ name: "GRAVIX" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "GRAVIX — YouTube Shorts Automation",
    description: "Automate YouTube Shorts republishing with smart channel mapping and scheduling",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "GRAVIX — YouTube Shorts Automation",
    description: "Automate YouTube Shorts republishing with smart channel mapping and scheduling",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${dmSans.variable} ${inter.variable} font-body bg-background text-foreground antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
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
