'use client';

import { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle, DollarSign, Ticket as TicketIcon, Calendar as CalendarIcon, Clock } from "lucide-react";
import Link from 'next/link';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { getDashboardData } from '@/lib/actions';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/context/auth-context';

interface DashboardData {
  totalRevenue: number;
  totalTicketsSold: number;
  totalEvents: number;
  pendingEvents: number;
  salesData: { name: string; ticketsSold: number }[];
}

export default function DashboardPageContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { user, isLoading: isAuthLoading } = useAuth();
  const isAdmin = user?.role?.name === 'Admin';

  useEffect(() => {
    async function fetchData() {
      if (isAuthLoading || !user) return; // Wait for auth to complete

      try {
        setLoading(true);
        const dashboardData = await getDashboardData();
        setData(dashboardData);
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [isAuthLoading, user]); // Depend on auth loading state and user

  const chartConfig = {
    ticketsSold: {
      label: "Tickets Sold",
      color: "#FEB914",
    },
  };
  
  const PageTitle = () => (
     <div className="space-y-2">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
            An overview of all your events.
        </p>
    </div>
  )

  const content = (
    <div className="flex flex-1 flex-col gap-4 md:gap-8">
      <PageTitle />
      
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">ETB {data?.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">From all approved events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets Sold</CardTitle>
            <TicketIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">+{data?.totalTicketsSold.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Across all approved events</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <CalendarIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data?.totalEvents}</div>
            <p className="text-xs text-muted-foreground">Managed in the system</p>
          </CardContent>
        </Card>
         {isAdmin && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending Events</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{data?.pendingEvents}</div>
                <p className="text-xs text-muted-foreground">Awaiting your approval</p>
              </CardContent>
            </Card>
        )}
      </div>

      <Card className="mt-4">
        <CardHeader>
            <CardTitle>Ticket Sales Overview</CardTitle>
            <CardDescription>A summary of tickets sold per approved event.</CardDescription>
        </CardHeader>
        <CardContent>
            {data?.salesData && data.salesData.length > 0 ? (
                <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
                    <BarChart accessibilityLayer data={data.salesData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid vertical={false} />
                        <XAxis dataKey="name" tickLine={false} tickMargin={10} axisLine={false} />
                        <YAxis />
                        <Tooltip cursor={{fill: 'hsl(var(--muted))'}} content={<ChartTooltipContent />} />
                        <Bar dataKey="ticketsSold" fill="#FEB914" radius={[4, 4, 0, 0]} />
                    </BarChart>
                </ChartContainer>
            ) : (
                <div className="flex items-center justify-center h-[250px] text-muted-foreground">
                    No ticket sales data to display for approved events.
                </div>
            )}
        </CardContent>
      </Card>
    </div>
  );

  if (loading || isAuthLoading || !data) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="w-full">
            <div className="flex flex-1 flex-col gap-4 md:gap-8">
                <PageTitle />
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-24" /><DollarSign className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><Skeleton className="h-7 w-20" /><Skeleton className="h-4 w-32 mt-1" /></CardContent></Card>
                    <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-24" /><TicketIcon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><Skeleton className="h-7 w-16" /><Skeleton className="h-4 w-28 mt-1" /></CardContent></Card>
                    <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-24" /><CalendarIcon className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><Skeleton className="h-7 w-8" /><Skeleton className="h-4 w-36 mt-1" /></CardContent></Card>
                    {isAdmin && <Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><Skeleton className="h-5 w-24" /><Clock className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><Skeleton className="h-7 w-8" /><Skeleton className="h-4 w-40 mt-1" /></CardContent></Card>}
                </div>
                <Card className="mt-4">
                    <CardHeader><Skeleton className="h-7 w-48 mb-2" /><Skeleton className="h-4 w-80" /></CardHeader>
                    <CardContent><Skeleton className="min-h-[250px] w-full" /></CardContent>
                </Card>
            </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center">
        <div className="w-full">
            {content}
        </div>
    </div>
  );
}
