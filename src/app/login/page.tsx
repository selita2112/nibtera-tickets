
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Link from 'next/link';
import Image from 'next/image';
import { useState } from 'react';
import { Loader2, ArrowRight, Phone, Lock, ArrowLeft } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';

const loginFormSchema = z.object({
  phoneNumber: z.string().min(1, { message: 'Phone number is required.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

type LoginFormValues = z.infer<typeof loginFormSchema>;

export default function LoginPage() {
  const { login, isLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      phoneNumber: '',
      password: '',
    },
  });

  const handleLogin = async (data: LoginFormValues) => {
    setIsSubmitting(true);
    await login(data);
    setIsSubmitting(false);
  };


  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-background p-4">
       <Button asChild variant="ghost" className="absolute top-4 left-4">
        <Link href="/">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Homepage
        </Link>
      </Button>
      <Card className="w-full max-w-md shadow-2xl">
        <CardHeader className="items-center text-center pt-8 pb-4">
            <Image
                src="/images/nibtickets.jpg"
                alt="NibTera Tickets Logo"
                width={200}
                height={60}
                className="object-contain"
                data-ai-hint="logo nibtera" 
                priority
            />
             <h2 className="text-xl font-semibold text-[#8B5E34] pt-2">
                Login
            </h2>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleLogin)} className="space-y-6">
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Phone className="h-4 w-4" />
                        Phone Number
                    </FormLabel>
                    <FormControl>
                      <Input 
                        placeholder="e.g., 0912345678" 
                        {...field} 
                        className="bg-transparent text-base border-0 border-b rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1"
                        disabled={isLoading || isSubmitting}
                        />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                        <Lock className="h-4 w-4" />
                        Password
                    </FormLabel>
                    <FormControl>
                      <PasswordInput {...field} className="bg-transparent text-base border-0 border-b rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 px-1" disabled={isLoading || isSubmitting} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
                <Button type="submit" className="w-full h-12 text-base font-bold" disabled={isLoading || isSubmitting}>
                {(isLoading || isSubmitting) ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <>
                    <ArrowRight className="mr-2 h-5 w-5" />
                    Sign In
                  </>
                )}
                </Button>
              <div className="text-sm text-center pt-2">
                <Link href="/forgot-password" className="text-muted-foreground hover:underline">
                  Forgot Password — Admin Only
                </Link>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
