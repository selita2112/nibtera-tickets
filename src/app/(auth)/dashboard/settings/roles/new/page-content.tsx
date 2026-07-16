'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { createRole } from '@/lib/actions';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';

const roleFormSchema = z.object({
  name: z.string().min(3, { message: 'Role name must be at least 3 characters.' }),
  description: z.string().min(10, { message: 'Description must be at least 10 characters.' }),
  permissions: z.array(z.string()).refine(value => value.some(item => item), {
    message: 'You have to select at least one permission.',
  }),
});

type RoleFormValues = z.infer<typeof roleFormSchema>;

const permissionCategoriesPlaceholder: Record<string, string[]> = {};
const settingsPermissionCategoriesPlaceholder: Record<string, string[]> = {};

export default function CreateRolePageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [permissionCategories, setPermissionCategories] = useState<Record<string, string[]>>(permissionCategoriesPlaceholder);
  const [settingsPermissionCategories, setSettingsPermissionCategories] = useState<Record<string, string[]>>(
    settingsPermissionCategoriesPlaceholder
  );

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: {
      name: '',
      description: '',
      permissions: [],
    },
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/permissions');
        if (res.ok) {
          const json = await res.json();
          const groups = json.permissions || {};
          const topLevel = {} as Record<string, string[]>;
          const settings = {} as Record<string, string[]>;
          for (const [k, v] of Object.entries(groups)) {
            if (['User Management', 'Role Management', 'Staff Management'].includes(k)) {
              settings[k] = v as string[];
            } else {
              topLevel[k] = v as string[];
            }
          }
          setPermissionCategories(topLevel);
          setSettingsPermissionCategories(settings);
        }
      } catch (e) {
        console.error('Failed to load permissions from server:', e);
      }
    })();
  }, []);

  async function onSubmit(data: RoleFormValues) {
    setIsSubmitting(true);
    try {
      await createRole(data);
      toast({
        title: 'Role Created!',
        description: `Successfully created the "${data.name}" role.`,
      });
      router.push('/dashboard/settings/roles');
    } catch (error: any) {
      console.error('Failed to create role:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to create role. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const renderPermissionCard = (category: string, actions: string[]) => {
    const isSingleAction = actions.length === 1 && actions[0] === 'Access';
    const permissionId = `${category}:Access`;

    if (isSingleAction) {
      return (
        <Card key={category}>
          <CardContent className="p-4 flex flex-row items-center justify-between rounded-lg">
            <FormLabel htmlFor={`switch-${category}`} className="text-base font-semibold">
              {category}
            </FormLabel>
            <FormField
              control={form.control}
              name="permissions"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Switch
                      id={`switch-${category}`}
                      checked={field.value?.includes(permissionId)}
                      onCheckedChange={checked => {
                        const updated = checked
                          ? [...(field.value || []), permissionId]
                          : (field.value || []).filter(p => p !== permissionId);
                        field.onChange(updated);
                      }}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </CardContent>
        </Card>
      );
    }

    const categoryPermissions = actions.map(action => `${category}:${action}`);
    const selectedCategoryPermissions = form
      .getValues('permissions')
      .filter(p => categoryPermissions.includes(p));
    const hasAll = selectedCategoryPermissions.length === categoryPermissions.length && actions.length > 0;

    return (
      <Card key={category}>
        <CardContent className="space-y-4 pt-6">
          <FormItem className="flex flex-row items-start space-x-3 space-y-0">
            <FormControl>
              <Checkbox
                checked={hasAll}
                onCheckedChange={checked => {
                  const currentPermissions = form.getValues('permissions');
                  let newPermissions;
                  if (checked) {
                    newPermissions = [...new Set([...currentPermissions, ...categoryPermissions])];
                  } else {
                    newPermissions = currentPermissions.filter(p => !categoryPermissions.includes(p));
                  }
                  form.setValue('permissions', newPermissions, { shouldValidate: true });
                }}
              />
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

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <div className="flex items-center gap-4 mb-4 md:mb-8">
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back</span>
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Create New Role</h1>
            <p className="text-muted-foreground">
              Define a new role and select the granular permissions it has for each page.
            </p>
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
                        <Input placeholder="e.g., Event Manager" {...field} />
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

