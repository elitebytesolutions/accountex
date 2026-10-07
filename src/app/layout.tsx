import type { Metadata, Viewport } from "next";
import { Caveat, Plus_Jakarta_Sans } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "./globals.css";

// The template's typeface (template/src/00-head.html), self-hosted.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});
// The template's handwriting face for taglines (Caveat 600 / 700, same Google Fonts link), self-hosted.
const caveat = Caveat({ variable: "--font-caveat", subsets: ["latin"], weight: ["600", "700"] });

export const metadata: Metadata = {
  title: "Accountex",
  description: "Accountex accounting platform",
};

export const viewport: Viewport = { themeColor: "#1F5F45" };

// Applies the saved light/dark choice before first paint (same key as the template), so there is no flash.
const themeScript = `try{var t=localStorage.getItem("fs-theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jakarta.variable} ${caveat.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
