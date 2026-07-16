'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import type { Role } from '@prisma/client';

import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { getRoleById, updateRole } from '@/lib/actions';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const roleFormSchema = z.object({
  name: z.string().min(3, { message: 'Role name must be at least 3 characters.' }),
  description: z.string().min(10, { message: 'Description must be at least 10 characters.' }),
  permissions: z.array(z.string()).refine(value => value.some(item => item), {
    message: 'You have to select at least one permission.',
  }),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

const permissionCategories = {
  Dashboard: ['Create', 'Read', 'Update', 'Delete'],
  'Scan QR': ['Create', 'Read', 'Update', 'Delete'],
  Events: ['Create', 'Read', 'Update', 'Delete'],
  Reports: ['Create', 'Read', 'Update', 'Delete'],
};

const settingsPermissionCategories = {
  'User Registration': ['Create', 'Read', 'Update', 'Delete'],
  'User Management': ['Create', 'Read', 'Update', 'Delete'],
  'Role Management': ['Create', 'Read', 'Update', 'Delete'],
  'Staff Management': ['Create', 'Read', 'Update', 'Delete'],
};

export default function EditRoleLegacyPageContent() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const roleId = params.id;
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: '',
      description: '',
      permissions: [],
    },
  });

  useEffect(() => {
    async function fetchRole() {
      if (!roleId) {
        router.push('/dashboard/settings/roles');
        return;
      }
      try {
        setLoading(true);
        const fetchedRole = await getRoleById(roleId);
        if (fetchedRole) {
          setRole(fetchedRole);
          let currentPermissions: string[] = [];
          if ((fetchedRole as any).permissions) {
            try {
              currentPermissions = JSON.parse((fetchedRole as any).permissions);
            } catch {
              currentPermissions = String((fetchedRole as any).permissions).split(',');
            }
          }
          form.reset({
            name: fetchedRole.name,
            description: fetchedRole.description || '',
            permissions: currentPermissions,
          });
        } else {
          toast({ variant: 'destructive', title: 'Error', description: 'Role not found.' });
          router.push('/dashboard/settings/roles');
        }
      } catch (error) {
        console.error('Failed to fetch role:', error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load role data.' });
      } finally {
        setLoading(false);
      }
    }
    fetchRole();
  }, [roleId, router, toast, form]);

  async function onSubmit(data: RoleFormValues) {
    if (!roleId) return;
    setIsSubmitting(true);
    try {
      await updateRole(roleId, { ...data, permissions: JSON.stringify(data.permissions) } as any);
      toast({
        title: 'Role Updated!',
        description: `Successfully updated the "${data.name}" role.`,
      });
      router.push('/dashboard/settings/roles');
    } catch (error) {
      console.error('Failed to update role:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to update role. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleFullAccessChange = (category: string, actions: string[], checked: boolean | 'indeterminate') => {
    const currentPermissions = form.getValues('permissions');
    const categoryPermissions = actions.map(action => `${category}:${action}`);

    let newPermissions;
    if (checked) {
      newPermissions = [...new Set([...currentPermissions, ...categoryPermissions])];
    } else {
      newPermissions = currentPermissions.filter(p => !categoryPermissions.includes(p));
    }
    form.setValue('permissions', newPermissions, { shouldValidate: true });
  };

  const renderPermissionCard = (category: string, actions: string[]) => {
    const categoryPermissions = actions.map(action => `${category}:${action}`);
    const selectedCategoryPermissions = form.getValues('permissions').filter(p => categoryPermissions.includes(p));
    const hasAll = selectedCategoryPermissions.length === categoryPermissions.length && actions.length > 0;

    return (
      <Card key={category}>
        <CardHeader>
          <CardTitle className="text-lg">{category}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
            <FormControl>
              <Checkbox checked={hasAll} onCheckedChange={checked => handleFullAccessChange(category, actions, checked)} />
            </FormControl>
            <FormLabel className="font-semibold">Full Access</FormLabel>
          </FormItem>
          <Separator />
          <div className={cn('grid gap-4', actions.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
            {actions.map(action => {
              const permissionId = `${category}:${action}`;
              return (
                <FormField
                  key={permissionId}
                  control={form.control}
                  name="permissions"
                  render={({ field: singleField }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={singleField.value?.includes(permissionId)}
                          onCheckedChange={checked => {
                            const updated = checked
                              ? [...singleField.value, permissionId]
                              : singleField.value?.filter(value => value !== permissionId);
                            singleField.onChange(updated);
                          }}
                        />
                      </FormControl>
                      <FormLabel className="font-normal">{action}</FormLabel>
                    </FormItem>
                  )}
                />
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-4 md:gap-8">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-64 mb-2" />
            <Skeleton className="h-5 w-48" />
          </div>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-7 w-48 mb-2" />
          </CardHeader>
          <CardContent className="space-y-8">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-20 w-full" />
            <div className="grid grid-cols-3 gap-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
            <Skeleton className="h-10 w-32" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="flex items-center gap-4 mb-4 md:mb-8">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Role</h1>
            <p className="text-muted-foreground">Update permissions for {form.getValues('name')}</p>
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Event Manager" {...field} disabled={role?.name === 'Admin'} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Briefly describe this role's purpose" className="resize-none" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-6">
                  <div>
                    <FormLabel>Permissions</FormLabel>
                    <FormDescription>Select the permissions for this role.</FormDescription>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {Object.entries(permissionCategories).map(([category, actions]) => renderPermissionCard(category, actions))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-6">
                  <div>
                    <h3 className="text-xl font-semibold">Settings</h3>
                    <FormDescription>Permissions for system settings.</FormDescription>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {Object.entries(settingsPermissionCategories).map(([category, actions]) =>
                      renderPermissionCard(category, actions)
                    )}
                  </div>
                </div>

                <FormMessage className="pt-4">{form.formState.errors.permissions?.message}</FormMessage>

                <Separator />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => router.back()}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#FBBF24', color: '#422006' }}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Changes
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

