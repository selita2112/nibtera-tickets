
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { Save, Loader2, ArrowLeft, Building, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { getDistricts, getBranches, createDistrict, createBranch } from '@/lib/actions';
import type { District, Branch } from '@prisma/client';
import { useAuth } from '@/context/auth-context';

interface DistrictWithBranches extends District {
  branches: Branch[];
}

const districtFormSchema = z.object({
  districtName: z.string().min(1, 'District name is required.'),
  contactPersonName: z.string().min(1, 'Contact person name is required.'),
  contactPersonPhone: z.string().min(10, 'Contact person phone must be at least 10 digits.'),
});

const branchFormSchema = z.object({
  branchName: z.string().min(1, 'Branch name is required.'),
  districtId: z.string({ required_error: 'Please select a district.' }),
  contactPersonName: z.string().min(1, 'Contact person name is required.'),
  contactPersonPhone: z.string().min(10, 'Contact person phone must be at least 10 digits.'),
});

type DistrictFormValues = z.infer<typeof districtFormSchema>;
type BranchFormValues = z.infer<typeof branchFormSchema>;

export default function BranchDistrictRegistrationPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { user, hasPermission, isLoading: authLoading } = useAuth();
  const [isSubmittingDistrict, setIsSubmittingDistrict] = useState(false);
  const [isSubmittingBranch, setIsSubmittingBranch] = useState(false);
  const [districts, setDistricts] = useState<District[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    } else if (!authLoading && !hasPermission('Staff Management:Access')) {
      router.push('/dashboard');
    }
  }, [user, authLoading, hasPermission, router]);

  const fetchAndSetData = async () => {
    if (!hasPermission('Staff Management:Access')) return;
    const [fetchedDistricts, fetchedBranches] = await Promise.all([
      getDistricts(),
      getBranches()
    ]);
    setDistricts(fetchedDistricts);
    setBranches(fetchedBranches);
  };

  useEffect(() => {
    if (user && hasPermission('Staff Management:Access')) {
      fetchAndSetData();
    }
  }, [user, hasPermission]);

  if (authLoading || !user || !hasPermission('Staff Management:Access')) {
    return (
      <div className="flex items-center justify-center h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const districtForm = useForm<DistrictFormValues>({
    resolver: zodResolver(districtFormSchema),
    defaultValues: {
      districtName: '',
      contactPersonName: '',
      contactPersonPhone: '',
    },
  });

  const branchForm = useForm<BranchFormValues>({
    resolver: zodResolver(branchFormSchema),
    defaultValues: {
      branchName: '',
      districtId: undefined,
      contactPersonName: '',
      contactPersonPhone: '',
    },
  });

  const onDistrictSubmit = async (data: DistrictFormValues) => {
    setIsSubmittingDistrict(true);
    try {
      await createDistrict(data);
      toast({
        title: 'District Registered',
        description: `The district "${data.districtName}" has been successfully saved.`,
      });
      districtForm.reset();
      await fetchAndSetData(); // Refresh data
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save the district.',
      });
    } finally {
      setIsSubmittingDistrict(false);
    }
  };

  const onBranchSubmit = async (data: BranchFormValues) => {
    setIsSubmittingBranch(true);
    try {
      await createBranch(data);
      toast({
        title: 'Branch Registered',
        description: `The branch "${data.branchName}" has been successfully saved.`,
      });
      branchForm.reset();
      await fetchAndSetData(); // Refresh data
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: error.message || 'Failed to save the branch.',
      });
    } finally {
      setIsSubmittingBranch(false);
    }
  };

  const districtsWithBranches: DistrictWithBranches[] = districts.map(district => ({
    ...district,
    branches: branches.filter(branch => branch.districtId === district.id),
  }));

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back</span>
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Branch and District Management</h1>
          <p className="text-muted-foreground">Add new districts first, then add branches under them.</p>
        </div>
      </div>
      <div className="grid gap-8 md:grid-cols-2">
        <Tabs defaultValue="district" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="district">District Registration</TabsTrigger>
            <TabsTrigger value="branch">Branch Registration</TabsTrigger>
          </TabsList>
          <TabsContent value="district">
            <Card>
              <CardHeader>
                <CardTitle>Register a New District</CardTitle>
                <CardDescription>Use this form to add a new district to the system.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...districtForm}>
                  <form onSubmit={districtForm.handleSubmit(onDistrictSubmit)} className="space-y-6">
                    <FormField control={districtForm.control} name="districtName" render={({ field }) => (
                      <FormItem>
                        <FormLabel>District Name</FormLabel>
                        <FormControl><Input placeholder="e.g., Central District" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )} />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={districtForm.control} name="contactPersonName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person Name</FormLabel>
                          <FormControl><Input placeholder="e.g., Jane Doe" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={districtForm.control} name="contactPersonPhone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Contact Person Phone</FormLabel>
                          <FormControl><Input placeholder="e.g., 0912345678" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={isSubmittingDistrict} style={{ backgroundColor: '#FBBF24', color: '#422006' }}>
                        {isSubmittingDistrict ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save District
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="branch">
            <Card>
              <CardHeader>
                <CardTitle>Register a New Branch</CardTitle>
                <CardDescription>Select a district and provide branch details.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...branchForm}>
                  <form onSubmit={branchForm.handleSubmit(onBranchSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={branchForm.control} name="branchName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch Name</FormLabel>
                          <FormControl><Input placeholder="e.g., Main Branch" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={branchForm.control} name="districtId" render={({ field }) => (
                        <FormItem>
                          <FormLabel>District</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger><SelectValue placeholder="Select a district" /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {districts.map(district => (
                                <SelectItem key={district.id} value={district.id}>{district.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <FormField control={branchForm.control} name="contactPersonName" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch Contact Person Name</FormLabel>
                          <FormControl><Input placeholder="e.g., John Smith" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                      <FormField control={branchForm.control} name="contactPersonPhone" render={({ field }) => (
                        <FormItem>
                          <FormLabel>Branch Contact Person Phone</FormLabel>
                          <FormControl><Input placeholder="e.g., 0987654321" {...field} /></FormControl>
                          <FormMessage />
                        </FormItem>
                      )} />
                    </div>
                    <div className="flex justify-end pt-4">
                      <Button type="submit" disabled={isSubmittingBranch} style={{ backgroundColor: '#FBBF24', color: '#422006' }}>
                        {isSubmittingBranch ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save Branch
                      </Button>
                    </div>
                  </form>
                </Form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <Card>
          <CardHeader>
            <CardTitle>Registered Districts and Branches</CardTitle>
            <CardDescription>A hierarchical view of all registered entities.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {districtsWithBranches.length > 0 ? (
                districtsWithBranches.map((district, index) => (
                  <div key={district.id}>
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <Building className="h-5 w-5" />
                      </div>
                      <h3 className="text-lg font-semibold">{district.name}</h3>
                    </div>
                    {district.branches.length > 0 ? (
                      <ul className="mt-2 ml-6 space-y-2 border-l-2 border-dashed pl-6">
                        {district.branches.map(branch => (
                          <li key={branch.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Users className="h-4 w-4" />
                            <span>{branch.name}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 ml-12 text-sm text-muted-foreground italic">No branches registered for this district.</p>
                    )}
                    {index < districtsWithBranches.length - 1 && <Separator className="mt-6" />}
                  </div>
                ))
              ) : (
                <p className="text-center text-muted-foreground">No districts have been registered yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
