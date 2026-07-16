'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { FileDown, Loader2, Search, Printer } from 'lucide-react';
import { getReportsData } from '@/lib/actions';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import type { TicketType, PromoCode, Event } from '@prisma/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DateRangePicker } from '@/components/date-range-picker';
import type { DateRange } from 'react-day-picker';
import { Input } from '@/components/ui/input';
import { useDebounce } from '@/hooks/use-debounce';


interface DailySale {
    date: Date;
    eventName: string;
    ticketsSold: number;
    revenue: number;
}

interface ProductSale extends TicketType {
    event: { name: string };
}

interface PromoCodeReport extends PromoCode {
    event: { name: string };
    totalDiscount: number;
}

interface ReportsData {
    productSales: ProductSale[];
    dailySales: DailySale[];
    promoCodes: PromoCodeReport[];
    events: Event[];
}

function convertToCSV(data: any[], headers: { key: string, label: string }[]): string {
    const headerRow = headers.map(h => h.label).join(',');
    const bodyRows = data.map(row => {
        return headers.map(header => {
            let value = row[header.key];
            
            if (header.key === 'date' && value instanceof Date) {
                value = format(value, 'yyyy-MM-dd');
            }

            if (header.key.includes('.')) {
                const keys = header.key.split('.');
                let nestedValue: any = row;
                for (const k of keys) {
                    if (nestedValue && typeof nestedValue === 'object') {
                        nestedValue = nestedValue[k];
                    } else {
                        nestedValue = undefined;
                        break;
                    }
                }
                value = nestedValue;
            }

            const stringValue = String(value ?? '').replace(/"/g, '""');
            return `"${stringValue}"`;
        }).join(',');
    });
    return [headerRow, ...bodyRows].join('\n');
}

export default function ReportsPageContent() {
    const [data, setData] = useState<ReportsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<DateRange | undefined>();
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);

    const fetchData = async (dateRange?: DateRange, search?: string) => {
        try {
            setLoading(true);
            const reportsData = await getReportsData(dateRange, search);
            setData(reportsData);
        } catch (error) {
            console.error("Failed to fetch reports data:", error);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        fetchData(dateRange, debouncedSearchQuery);
    }, [dateRange, debouncedSearchQuery]);

    const handleDownload = (reportType: 'product' | 'daily' | 'promo') => {
        if (!data) return;
        setDownloading(reportType);
        
        let csvContent = '';
        let filename = '';
        let headers: { key: string, label: string }[] = [];

        try {
            if (reportType === 'product' && data.productSales) {
                filename = 'product_sales_report.csv';
                headers = [
                    { key: 'name', label: 'Product' },
                    { key: 'event.name', label: 'Event' },
                    { key: 'sold', label: 'Quantity Sold' },
                    { key: 'basePrice', label: 'Price (ETB)' },
                    { key: 'revenue', label: 'Revenue (ETB)' },
                ];
                const productData = data.productSales.map(p => ({ ...p, revenue: p.sold * Number(p.basePrice) }));
                csvContent = convertToCSV(productData, headers);
            } else if (reportType === 'daily' && data.dailySales) {
                filename = 'daily_sales_report.csv';
                 headers = [
                    { key: 'date', label: 'Date' },
                    { key: 'eventName', label: 'Event' },
                    { key: 'ticketsSold', label: 'Tickets Sold' },
                    { key: 'revenue', label: 'Net Revenue (ETB)' },
                ];
                csvContent = convertToCSV(data.dailySales, headers);
            } else if (reportType === 'promo' && data.promoCodes) {
                filename = 'promo_codes_report.csv';
                headers = [
                    { key: 'code', label: 'Code' },
                    { key: 'event.name', label: 'Event' },
                    { key: 'uses', label: 'Times Used' },
                    { key: 'maxUses', label: 'Usage Limit' },
                    { key: 'totalDiscount', label: 'Total Discount (ETB)' },
                ];
                csvContent = convertToCSV(data.promoCodes, headers);
            }

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            if (link.download !== undefined) {
                const url = URL.createObjectURL(blob);
                link.setAttribute("href", url);
                link.setAttribute("download", filename);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error("Failed to download report:", error);
        } finally {
            setTimeout(() => setDownloading(null), 500);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading && !data) {
        return (
            <div className="flex flex-1 flex-col gap-4 md:gap-8">
                <div className="space-y-2">
                    <Skeleton className="h-8 w-32" />
                    <Skeleton className="h-4 w-96" />
                </div>
                <div className="space-y-8">
                    {[...Array(3)].map((_, i) => (
                        <Card key={i}>
                            <CardHeader className="flex flex-row items-center justify-between">
                                <div className="space-y-2">
                                    <Skeleton className="h-6 w-48" />
                                    <Skeleton className="h-4 w-80" />
                                </div>
                                <Skeleton className="h-10 w-40" />
                            </CardHeader>
                            <CardContent>
                               <Skeleton className="h-40 w-full" />
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        )
    }

  return (
    <div className="flex flex-1 flex-col gap-4 md:gap-8">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
            <p className="text-muted-foreground">
            View and download reports for your events. Only completed orders are included.
            </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto">
             <div className="relative w-full sm:w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by event name"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                />
            </div>
            <DateRangePicker date={dateRange} setDate={setDateRange} />
            <Button variant="outline" onClick={handlePrint}>
                <Printer className="mr-2 h-4 w-4" />
                Print Report
            </Button>
        </div>
      </div>

      <div className="space-y-8">
        <Card>
          <CardHeader className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <CardTitle>Daily Sales Report</CardTitle>
              <CardDescription>A summary of sales for each event date.</CardDescription>
            </div>
            <Button 
                variant="outline" 
                onClick={() => handleDownload('daily')} 
                disabled={downloading === 'daily' || loading}
                className="w-full md:w-auto print:hidden"
            >
                {downloading === 'daily' || loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                Download Report
            </Button>
          </CardHeader>
          <CardContent>
             <ScrollArea className="h-[300px]">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Tickets Sold</TableHead>
                    <TableHead className="text-right">Net Revenue</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading && (
                        <TableRow><TableCell colSpan={4} className="h-24 text-center"><Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /></TableCell></TableRow>
                    )}
                    {!loading && data?.dailySales.map((sale, index) => (
                        <TableRow key={index}>
                            <TableCell>{format(new Date(sale.date), 'LLL dd, y')}</TableCell>
                            <TableCell className="font-medium">{sale.eventName}</TableCell>
                            <TableCell className="text-right">{sale.ticketsSold.toLocaleString()}</TableCell>
                            <TableCell className="text-right">ETB {sale.revenue.toLocaleString()}</TableCell>
                        </TableRow>
                    ))}
                    {!loading && data?.dailySales.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center h-24">No sales data available for the selected period.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
                </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Product Sales</CardTitle>
              <CardDescription>Product sales, revenue, and other metrics.</CardDescription>
            </div>
            <Button variant="outline" onClick={() => handleDownload('product')} disabled={downloading === 'product'} className="w-full sm:w-auto print:hidden">
                {downloading === 'product' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                Download Report
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Quantity Sold</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data?.productSales.map((ticket) => (
                        <TableRow key={ticket.id}>
                        <TableCell className="font-medium">{ticket.name}</TableCell>
                        <TableCell className="text-muted-foreground">{ticket.event?.name || 'N/A'}</TableCell>
                        <TableCell className="text-right">{ticket.sold}</TableCell>
                        <TableCell className="text-right">ETB {Number(ticket.basePrice).toFixed(2)}</TableCell>
                        <TableCell className="text-right">ETB {(ticket.sold * Number(ticket.basePrice)).toLocaleString()}</TableCell>
                        </TableRow>
                    ))}
                    {data?.productSales.length === 0 && (
                        <TableRow><TableCell colSpan={5} className="text-center h-24">No product sales data.</TableCell></TableRow>
                    )}
                </TableBody>
                </Table>
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <CardTitle>Promo Codes Report</CardTitle>
              <CardDescription>Promo code usage and discount breakdown.</CardDescription>
            </div>
             <Button variant="outline" onClick={() => handleDownload('promo')} disabled={downloading === 'promo'} className="w-full sm:w-auto print:hidden">
                {downloading === 'promo' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                Download Report
            </Button>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="text-right">Usage</TableHead>
                    <TableHead className="text-right">Total Discount (est.)</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data?.promoCodes.map((code) => (
                        <TableRow key={code.id}>
                            <TableCell className="font-mono">{code.code}</TableCell>
                            <TableCell className="text-muted-foreground">{code.event?.name || 'N/A'}</TableCell>
                            <TableCell className="text-right">{code.uses} / {code.maxUses}</TableCell>
                            <TableCell className="text-right">ETB {code.totalDiscount.toFixed(2)}</TableCell>
                        </TableRow>
                    ))}
                    {data?.promoCodes.length === 0 && (
                        <TableRow>
                            <TableCell colSpan={4} className="text-center h-24">No promo code data available.</TableCell>
                        </TableRow>
                    )}
                </TableBody>
                </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
