"use client";
import {usePathname} from 'next/navigation';
import {isPublicGameRoute} from '@/config/public-game-routes';
import DashboardLayout from '@/components/layout/DashboardLayout';
export function GamesRouteShell({children}:{children:React.ReactNode}){
 return isPublicGameRoute(usePathname()||'')?<main id="main-content" className="gp-sol-page">{children}</main>:<DashboardLayout>{children}</DashboardLayout>;
}
