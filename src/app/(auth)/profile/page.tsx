
'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, KeyRound, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/context/auth-context';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import api from '@/lib/api';
import { useRouter } from 'next/navigation';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: 'Current password is required.' }),
  newPassword: z.string()
    .min(8, { message: 'Password must be at least 8 characters long.' })
    .regex(/[a-z]/, { message: 'Password must contain at least one lowercase letter.' })
    .regex(/[A-Z]/, { message: 'Password must contain at least one uppercase letter.' })
    .regex(/[0-9]/, { message: 'Password must contain at least one number.' })
    .regex(/[^A-Za-z0-9]/, { message: 'Password must contain at least one special character.' }),
  confirmPassword: z.string(),
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "New passwords do not match.",
  path: ["confirmPassword"],
});

type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;

export default function ProfilePage() {
  const { toast } = useToast();
  const router = useRouter();
  const { user, logout, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  async function onSubmit(data: ChangePasswordFormValues) {
    if (!user?.phoneNumber) {
        toast({ variant: 'destructive', title: 'Error', description: 'User session is invalid. Please log in again.' });
        return;
    }

    setIsSubmitting(true);
    try {
        const response = await api.post('/api/auth/change-password', {
            phoneNumber: user.phoneNumber,
            currentPassword: data.currentPassword,
            newPassword: data.newPassword,
        });
        
        if (response.status === 200 && response.data.success) {
            toast({
                title: 'Success!',
                description: 'Your password has been changed successfully. You will be logged out for security.'
            });
            
            // Redirect or handle post-change logic
            setTimeout(() => {
                logout();
            }, 1500);

        } else {
             // This branch is now unlikely to be hit due to axios throwing on non-2xx statuses, but is kept for safety.
             throw new Error(response.data.errors?.join(', ') || 'Password change failed. Please check your current password and try again.');
        }

    } catch (error: any) {
        console.error("Failed to change password:", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error.response?.data?.errors?.join(', ') || error.message || "Password change failed. Please try again.",
        });
    } finally {
        setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-lg">
      <CardHeader>
        <CardTitle>Change Password</CardTitle>
      </CardHeader>
      <CardContent>
         {user?.passwordChangeRequired && (
          <Alert variant="destructive" className="mb-6 border-yellow-500/50 text-yellow-500 dark:border-yellow-500 [&>svg]:text-yellow-500">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Action Required</AlertTitle>
              <AlertDescription>
                  For your security, change your temporary password before accessing the dashboard.
              </AlertDescription>
          </Alert>
        )}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="currentPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Current Password</FormLabel>
                  <FormControl>
                    <PasswordInput placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New Password</FormLabel>
                  <FormControl>
                    <PasswordInput placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm New Password</FormLabel>
                  <FormControl>
                    <PasswordInput placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex justify-end pt-2">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Change Password
              </Button>
            </div>
          </form>
        </Form>
        <p className="text-sm text-muted-foreground mt-4">
          Password must be at least 8 characters and contain at least one uppercase letter, one lowercase letter, one number, and one special character.
        </p>
      </CardContent>
    </Card>
  );
}
