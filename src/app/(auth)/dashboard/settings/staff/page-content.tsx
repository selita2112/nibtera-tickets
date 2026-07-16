'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import type { Branch, District, Role, User } from '@prisma/client';
import { useRouter } from 'next/navigation';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { ArrowLeft, Check, Loader2, Mail, Trash2, UserPlus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { addUser, deleteUser, getStaffForUser, resetStaffPassword } from '@/lib/actions';
import { useAuth } from '@/context/auth-context';

const addStaffFormSchema = z.object({
  firstName: z.string().min(1, { message: 'First name is required.' }),
  lastName: z.string().min(1, { message: 'Last name is required.' }),
  phoneNumber: z.string().min(10, { message: 'Phone number must be at least 10 digits.' }),
  email: z.string().email({ message: 'Invalid email address.' }),
});

type AddStaffFormValues = z.infer<typeof addStaffFormSchema>;

interface StaffWithDetails extends User {
  role: Role;
  branch?: (Branch & { district: District }) | null;
}

export default function StaffPageContent() {
  const { toast } = useToast();
  const router = useRouter();
  const { user: currentUser } = useAuth();

  const [staffMembers, setStaffMembers] = useState<StaffWithDetails[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [userToDelete, setUserToDelete] = useState<StaffWithDetails | null>(null);
  const [isResettingId, setIsResettingId] = useState<string | null>(null);

  const fetchStaff = async () => {
    if (!currentUser) return;
    setLoadingStaff(true);
    try {
      const staff = await getStaffForUser(currentUser.id);
      setStaffMembers(staff);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Could not load staff members.' });
    } finally {
      setLoadingStaff(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      fetchStaff();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  const addStaffForm = useForm<AddStaffFormValues>({
    resolver: zodResolver(addStaffFormSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      phoneNumber: '',
      email: '',
    },
  });

  async function onAddStaffSubmit(data: AddStaffFormValues) {
    setIsSubmitting(true);
    setIsSuccess(false);

    try {
      const result = await addUser(data, true);

      if (result.success) {
        toast({
          title: 'Staff Member Added',
          description: `An email with credentials has been sent to ${data.email}.`,
        });
        setIsSuccess(true);
        addStaffForm.reset();
        fetchStaff();
      } else {
        toast({
          variant: 'destructive',
          title: 'Failed to Add Staff',
          description: result.error || 'An unknown error occurred.',
        });
      }
    } catch (error: any) {
      console.error('Staff registration failed on client:', error);
      toast({
        variant: 'destructive',
        title: 'Client Error',
        description: error.message || 'Something went wrong before the request could be completed.',
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleDelete = async () => {
    if (!userToDelete) return;
    try {
      const result = await deleteUser(userToDelete.id, userToDelete.phoneNumber);
      if (result && (result.ok === true || result.success === true)) {
        toast({
          title: 'Staff Member Deleted',
          description: `Successfully deleted ${userToDelete.firstName} ${userToDelete.lastName}.`,
        });
        fetchStaff();
      } else {
        toast({
          variant: 'destructive',
          title: 'Delete Failed',
          description: result?.message || 'Failed to delete staff member.',
        });
      }
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error Deleting Staff Member',
        description: error.message || 'An unexpected error occurred.',
      });
    } finally {
      setUserToDelete(null);
    }
  };

  const handleResetPassword = async (staff: StaffWithDetails) => {
    setIsResettingId(staff.id);
    try {
      const result = await resetStaffPassword(staff.id);
      if (result && result.ok) {
        toast({ title: 'Password Reset', description: `A temporary password has been sent to ${staff.email}.` });
        fetchStaff();
      } else {
        toast({ variant: 'destructive', title: 'Reset Failed', description: result?.message || 'Failed to reset password.' });
      }
    } catch (err: any) {
      console.error('Reset password failed:', err);
      toast({ variant: 'destructive', title: 'Error', description: err?.message || 'Failed to reset password.' });
    } finally {
      setIsResettingId(null);
    }
  };

  if (!currentUser) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-1 flex-col items-center p-4 md:p-8 space-y-8">
        <div className="w-full max-w-6xl">
          <div className="flex items-center gap-4 mb-4 md:mb-8">
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Staff Management</h1>
              <p className="text-muted-foreground">Register new staff members and manage existing accounts.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <CardTitle>Register New Staff</CardTitle>
                  <CardDescription>A temporary password will be sent to the staff member&apos;s email.</CardDescription>
                </CardHeader>
                <CardContent>
                  {isSuccess ? (
                    <div className="space-y-6">
                      <Alert variant="default" className="bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800">
                        <Check className="h-4 w-4 text-green-600 dark:text-green-300" />
                        <AlertTitle className="text-green-800 dark:text-green-300">Staff Added!</AlertTitle>
                        <AlertDescription className="text-green-700 dark:text-green-400">
                          An email with credentials has been sent.
                        </AlertDescription>
                      </Alert>
                      <Button className="w-full" variant="outline" onClick={() => setIsSuccess(false)}>
                        Add Another Staff Member
                      </Button>
                    </div>
                  ) : (
                    <Form {...addStaffForm}>
                      <form onSubmit={addStaffForm.handleSubmit(onAddStaffSubmit)} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <FormField
                            control={addStaffForm.control}
                            name="firstName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>First Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="John" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={addStaffForm.control}
                            name="lastName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Last Name</FormLabel>
                                <FormControl>
                                  <Input placeholder="Doe" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <FormField
                          control={addStaffForm.control}
                          name="phoneNumber"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input placeholder="0912345678" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={addStaffForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email</FormLabel>
                              <FormControl>
                                <Input type="email" placeholder="john.doe@example.com" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="flex justify-end pt-4">
                          <Button type="submit" disabled={isSubmitting} style={{ backgroundColor: '#FBBF24', color: '#422006' }}>
                            {isSubmitting && <Loader2 className="animate-spin mr-2" />}{' '}
                            <UserPlus className="mr-2 h-4 w-4" /> Register Staff
                          </Button>
                        </div>
                      </form>
                    </Form>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <CardTitle>Your Staff Members</CardTitle>
                  <CardDescription>List of staff members you have registered.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Phone Number</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingStaff ? (
                        <TableRow>
                          <TableCell colSpan={4} className="h-24 text-center">
                            <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                          </TableCell>
                        </TableRow>
                      ) : staffMembers.length > 0 ? (
                        staffMembers.map(staff => (
                          <TableRow key={staff.id}>
                            <TableCell className="font-medium">
                              {staff.firstName} {staff.lastName}
                            </TableCell>
                            <TableCell>{staff.phoneNumber}</TableCell>
                            <TableCell>{staff.email}</TableCell>
                            <TableCell className="text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    aria-label="Resend email"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleResetPassword(staff)}
                                    disabled={isResettingId === staff.id}
                                  >
                                    <Mail className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Resend email</TooltipContent>
                              </Tooltip>
                              <Button variant="ghost" size="icon" onClick={() => setUserToDelete(staff)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center h-24">
                            You have not registered any staff members yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={!!userToDelete} onOpenChange={open => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the staff member{' '}
              <strong>
                {userToDelete?.firstName} {userToDelete?.lastName}
              </strong>
              . This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

