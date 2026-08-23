import "./globals.css";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/Navbar";
import { Sidebar } from "@/components/Sidebar";
import { Providers } from "./providers";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Quản Lý Công Việc V1.2",
  description: "Hệ thống quản lý công việc nhóm chuyên nghiệp",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="vi">
      <body className="bg-slate-50 text-slate-900 min-h-screen flex flex-col">
        <Providers>
          {user ? (
            <div className="min-h-screen flex flex-col">
              <Navbar user={user} />
              <div className="flex flex-1">
                <Sidebar role={user.role} />
                <main className="flex-1 p-4 sm:p-6 lg:p-8 w-full min-w-0">
                  {children}
                </main>
              </div>
            </div>
          ) : (
            <main className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
              {children}
            </main>
          )}
        </Providers>
      </body>
    </html>
  );
}
