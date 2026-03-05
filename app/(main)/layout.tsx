import { NavigationSidebar } from "@/components/navigation/navigation-sidebar";

const MainLayout = async ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="h-full">
      <div className="flex w-[88px] z-50 flex-col fixed top-0 bottom-[84px] left-0">
        <NavigationSidebar />
      </div>
      <main className="pl-[88px] h-full">{children}</main>
    </div>
  );
};

export default MainLayout;
