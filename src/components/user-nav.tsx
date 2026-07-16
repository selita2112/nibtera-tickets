
'use client';

import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/context/auth-context";

export function UserNav() {
  const { user, logout, hasPermission } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
  };
  
  const getInitials = () => {
    if (user?.firstName && user?.lastName) {
        return `${user.firstName[0]}${user.lastName[0]}`;
    }
    return 'U';
  }

  const isAdmin = user?.role?.name === 'Admin';
  
  const canViewSettings = isAdmin || [
    'User Management:Create',
    'User Management:Read',
    'User Management:Update',
    'User Management:Delete',
    'Role Management:Read',
    'Staff Management:Access'
  ].some(p => hasPermission(p));

  const sanitizedPhoneNumber = user?.phoneNumber?.replace(/[^0-9+]/g, '');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-10 w-10 rounded-full">
          <Avatar className="h-10 w-10">
            <AvatarImage src="https://placehold.co/40x40.png" alt="@user" data-ai-hint="profile person" />
            <AvatarFallback>{getInitials()}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
            {user ? (
                <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">{user.firstName} {user.lastName}</p>
                    <p className="text-xs leading-none text-muted-foreground">
                    {sanitizedPhoneNumber}
                    </p>
                </div>
            ) : (
                 <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium leading-none">Organizer</p>
                    <p className="text-xs leading-none text-muted-foreground">
                        Not logged in
                    </p>
                </div>
            )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push('/dashboard')}>Dashboard</DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push('/profile')}>Profile</DropdownMenuItem>
          {canViewSettings && (
            <DropdownMenuItem onClick={() => router.push('/dashboard/settings')}>Settings</DropdownMenuItem>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>Log out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
