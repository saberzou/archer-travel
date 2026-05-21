import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Archer · Travel",
  description: "Conversational AI flight booking — TravelKit MCP + Gemini",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-black text-white antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
