'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Role } from '@prisma/client';
import { ArrowLeft, Pencil, PlusCircle, Trash2 } from 'lucide-react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { deleteRole, getRoles } from '@/lib/actions';
import { FLAT_PERMISSIONS } from '@/lib/permissions';
import { useAuth } from '@/context/auth-context';

export default function RolesPageContent() {
  const router = useRouter();
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission('Role Management:Create');
  const canUpdate = hasPermission('Role Management:Update');
  const canDelete = hasPermission('Role Management:Delete');

  const fetchRoles = async () => {
    try {
      !loading && setLoading(true);
      const fetchedRoles = await getRoles();
      setRoles(fetchedRoles);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load roles.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteRole = async (roleId: string) => {
    try {
      await deleteRole(roleId);
      toast({
        title: 'Role Deleted',
        description: 'The role has been successfully deleted.',
      });
      fetchRoles();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error Deleting Role',
        description: error.message || 'Failed to delete role. It may be assigned to users.',
      });
    }
  };

  const getPermissionCount = (role: Role & { permissions: string | string[] }) => {
    if (role.name === 'Admin') {
      return FLAT_PERMISSIONS.length;
    }

    if (!role.permissions) {
      return 0;
    }

    if (Array.isArray(role.permissions)) {
      return role.permissions.length;
    }

    try {
      const parsed = JSON.parse(role.permissions);
      if (Array.isArray(parsed)) {
        return parsed.length;
      }
    } catch {
      // Fallback for non-JSON string (e.g., comma-separated)
      return role.permissions.split(',').filter(Boolean).length;
    }

    return 0;
  };

  return (
    <div className="flex flex-1 justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="flex flex-1 flex-col gap-4 md:gap-8">
          <div className="flex items-center gap-4">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
            <div className="flex-1">
              <h1 className="text-3xl font-bold tracking-tight">Role Management</h1>
              <p className="text-muted-foreground">Define user roles and their permissions within the application.</p>
            </div>
          </div>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>All Roles</CardTitle>
                <CardDescription>A list of all user roles in the system.</CardDescription>
              </div>
              {canCreate && (
                <Button asChild style={{ backgroundColor: '#FBBF24', color: '#422006' }}>
                  <Link href="/dashboard/settings/roles/new">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add New Role
                  </Link>
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Permissions Count</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map(role => (
                      <TableRow key={role.id}>
                        <TableCell className="font-mono uppercase">{role.name}</TableCell>
                        <TableCell className="text-muted-foreground">{role.description || '-'}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{getPermissionCount(role as Role & { permissions: string | string[] })} assigned</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canUpdate && (
                              <Button variant="ghost" size="icon" asChild disabled={role.name === 'Admin'}>
                                <Link href={`/dashboard/settings/roles/${role.id}/edit`}>
                                  <Pencil className="h-4 w-4" />
                                  <span className="sr-only">Edit</span>
                                </Link>
                              </Button>
                            )}
                            {canDelete && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button variant="ghost" size="icon" disabled={role.name === 'Admin'}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                    <span className="sr-only">Delete</span>
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone. This will permanently delete the <strong>{role.name}</strong> role.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDeleteRole(role.id)} className="bg-destructive hover:bg-destructive/90">
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

