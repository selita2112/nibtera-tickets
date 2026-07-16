
'use client';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Settings, UserPlus, Users, ShieldCheck, Building, UserCog, Images } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

export default function SettingsPageContent() {
  const { user, hasPermission } = useAuth();
  const isAdmin = user?.role?.name === 'Admin';

  const managementCards = [
    {
      title: 'Homepage Carousel',
      icon: <Images className="h-5 w-5" />,
      description:
        'Manage promotional slides on the public homepage. These images are separate from event photos.',
      buttonText: 'Manage Carousel',
      href: '/dashboard/settings/homeads',
      color: '#FBBF24',
      textColor: '#422006',
      adminOnly: true,
    },
    {
      title: 'User Registration',
      icon: <UserPlus className="h-5 w-5" />,
      description: 'Register new high-level users for the application, such as Admins or Organizers. New users are created with roles you assign.',
      buttonText: 'Go to User Registration',
      href: '/dashboard/settings/users/new',
      color: '#FBBF24',
      textColor: '#422006',
      permission: 'User Management:Create'
    },
    {
      title: 'User Management',
      icon: <Users className="h-5 w-5" />,
      description: 'Manage all user accounts, roles, and status. Assign roles and manage access levels across the application.',
      buttonText: 'Go to User Management',
      href: '/dashboard/settings/users',
      color: '#FBBF24',
      textColor: '#422006',
      permission: ['User Management:Read', 'User Management:Update', 'User Management:Delete']
    },
    {
      title: 'Staff Management',
      icon: <UserCog className="h-5 w-5" />,
      description: 'Register and manage your own staff members. Staff have limited permissions to scan tickets and view event dashboards.',
      buttonText: 'Go to Staff Management',
      href: '/dashboard/settings/staff',
      color: '#FBBF24',
      textColor: '#422006',
      permission: 'Staff Management:Access' 
    },
    {
      title: 'Role Management',
      icon: <ShieldCheck className="h-5 w-5" />,
      description: 'Define roles and their permissions. Create new roles or edit existing ones to control what users can do.',
      buttonText: 'Go to Role Management',
      href: '/dashboard/settings/roles',
      color: '#FBBF24',
      textColor: '#422006',
      permission: 'Role Management:Read'
    },
    {
      title: 'Branch and District Registration',
      icon: <Building className="h-5 w-5" />,
      description: 'Add new branch and district information to the system. This information can be used for organizing events or users.',
      buttonText: 'Go to Registration',
      href: '/dashboard/settings/branch-district-registration',
      color: '#FBBF24',
      textColor: '#422006',
      permission: 'User Management:Read' // Assuming this permission is appropriate
    }
  ];

  const visibleCards = managementCards.filter(card => {
    if ('adminOnly' in card && card.adminOnly && !isAdmin) {
      return false;
    }
    if (isAdmin) return true;
    
    if (Array.isArray(card.permission)) {
      return card.permission.some(p => hasPermission(p));
    }
    if (typeof card.permission === 'string') {
      return hasPermission(card.permission);
    }
    return false;
  });

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-8">
      <div className="flex items-center gap-4">
        <Settings className="h-8 w-8" />
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Application Settings</h1>
          <p className="text-muted-foreground">
            Manage users, roles, and other application configurations.
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visibleCards.map((card) => (
          <Card key={card.title} className="flex flex-col">
            <CardHeader>
              <CardTitle>{card.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow">
              <CardDescription>{card.description}</CardDescription>
            </CardContent>
            <CardFooter>
                <Button asChild className="w-full" style={{ backgroundColor: card.color, color: card.textColor }}>
                <Link href={card.href}>
                  {card.icon}
                  {card.buttonText}
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}
