import "./globals.css";

export const metadata = {
  title: "Football Stats Agent",
  description: "Football statistics app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
