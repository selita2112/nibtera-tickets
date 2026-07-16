'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray, Control, useWatch } from 'react-hook-form';
import * as z from 'zod';
import { useRouter } from 'next/navigation';
import { PlusCircle, Trash2, UploadCloud, Loader2, X } from 'lucide-react';
import Image from 'next/image';
import React, { useState, useEffect } from 'react';

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { addEvent } from '@/lib/actions';
import { Separator } from '@/components/ui/separator';
import LocationInput from '@/components/location-input';
import { DateTimePicker } from '@/components/datetime-picker';
import { useAuth, ensureCsrfToken } from '@/context/auth-context';
import api from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

const locationPriceSchema = z.object({
  location: z.string().min(1, "Location is required."),
  price: z.coerce.number().min(0, 'Price must be a positive number or zero.'),
  quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1.'),
  free: z.boolean().default(false),
  maxFreeTicketsPerPhone: z.coerce.number().int().min(1, 'Max tickets per phone must be at least 1.').default(5),
});

const ticketSchema = z.object({
  name: z.string().min(1, { message: "Ticket name can't be empty."}),
  description: z.string().optional(),
  locationPrices: z.array(locationPriceSchema).min(1, "You must add at least one location configuration."),
});

const eventFormSchema = z.object({
  name: z.string().min(3, { message: 'Event name must be at least 3 characters.' }),
  description: z.string().min(10, { message: 'Description must be at least 10 characters.' }),
  locations: z.array(z.object({
    value: z.string().min(3, { message: "Location can't be empty."}),
  })).min(1, { message: 'You must have at least one location.'}),
  hint: z.string().optional(),
  startDate: z.date({
    required_error: 'A start date and time for the event is required.',
  }),
  endDate: z.date().optional(),
  category: z.string({ required_error: 'Please select a category.' }),
  otherCategory: z.string().optional(),
  images: z.array(z.string()).min(1, { message: 'Please upload exactly one image.' }),
  tickets: z.array(ticketSchema).min(1, { message: 'You must have at least one ticket tier.'}),
}).refine(data => {
    if (data.category === 'Other') {
        return !!data.otherCategory && data.otherCategory.length > 0;
    }
    return true;
}, {
    message: 'Please specify the category.',
    path: ['otherCategory'],
});

type EventFormValues = z.infer<typeof eventFormSchema>;

// New Component for a single location price row to fix hook error
const LocationPriceRow = ({
    control,
    ticketIndex,
    priceIndex,
    watchedLocations,
    setValue,
}: {
    control: Control<EventFormValues>;
    ticketIndex: number;
    priceIndex: number;
    watchedLocations: { value: string }[];
    setValue: Function;
}) => {
  const isFree = useWatch({
    control,
    name: `tickets.${ticketIndex}.locationPrices.${priceIndex}.free`,
  });

  const [isLimitDialogOpen, setIsLimitDialogOpen] = useState(false);

    return (
        <div className="grid grid-cols-12 gap-2 items-end">
            <FormField
              control={control}
              name={`tickets.${ticketIndex}.locationPrices.${priceIndex}.location`}
              render={({ field }) => (
                <FormItem className="col-span-4">
                  <FormLabel className="text-xs">Location</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger></FormControl>
                    <SelectContent>{watchedLocations.map(l => l.value).filter(Boolean).map(loc => <SelectItem key={loc} value={loc}>{loc}</SelectItem>)}</SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="col-span-2 flex items-center gap-2 pb-[2px]">
              <FormLabel className="text-xs whitespace-nowrap">Free Ticket</FormLabel>
              <Switch
                checked={!!isFree}
                onCheckedChange={(checked) => {
                  setValue(`tickets.${ticketIndex}.locationPrices.${priceIndex}.free`, checked, { shouldValidate: true });
                  if (checked) {
                    setValue(`tickets.${ticketIndex}.locationPrices.${priceIndex}.price`, 0, { shouldValidate: true });
                    // Open configuration modal for free-ticket limits.
                    setIsLimitDialogOpen(true);
                  }
                }}
              />
            </div>
            <FormField
              control={control}
              name={`tickets.${ticketIndex}.locationPrices.${priceIndex}.price`}
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel className="text-xs">Price</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="500" {...field} required disabled={!!isFree} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={control}
              name={`tickets.${ticketIndex}.locationPrices.${priceIndex}.quantity`}
              render={({ field }) => (
                <FormItem className="col-span-3">
                  <FormLabel className="text-xs">Quantity</FormLabel>
                  <FormControl><Input type="number" placeholder="100" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {isFree ? (
              <div className="col-span-full">
                {/* Modal-like configuration panel for free ticket limits */}
                <AlertDialog open={isLimitDialogOpen} onOpenChange={setIsLimitDialogOpen}>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Free Ticket Limit</AlertDialogTitle>
                      <AlertDialogDescription>
                        Set how many free tickets a single phone number can claim for this ticket tier.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="space-y-4">
                      <FormField
                        control={control}
                        name={`tickets.${ticketIndex}.locationPrices.${priceIndex}.maxFreeTicketsPerPhone`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Maximum tickets per phone</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                min={1}
                                placeholder="e.g., 5"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <AlertDialogFooter>
                      <AlertDialogCancel onClick={() => setIsLimitDialogOpen(false)}>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => setIsLimitDialogOpen(false)}>Save</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ) : null}
          </div>
    );
};


// New component for Ticket Tier Card to correctly handle nested field array
const TicketTierCard = ({
  ticketIndex,
  control,
  remove,
  totalTickets,
  watchedLocations,
  getValues,
  setValue,
}: {
  ticketIndex: number;
  control: Control<EventFormValues>;
  remove: (index: number) => void;
  totalTickets: number;
  watchedLocations: { value: string }[];
  getValues: Function;
  setValue: Function;
}) => {
  const { fields: locationPriceFields, append: appendLocationPrice, remove: removeLocationPrice } = useFieldArray({
    control,
    name: `tickets.${ticketIndex}.locationPrices`,
  });

  return (
    <Card className="p-4 space-y-4">
      <div className="flex justify-between items-start">
        <FormField
          control={control}
          name={`tickets.${ticketIndex}.name`}
          render={({ field }) => (
            <FormItem className="flex-grow pr-4">
              <FormLabel>Ticket Name</FormLabel>
              <FormControl><Input {...field} placeholder="e.g., VIP Pass" /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => remove(ticketIndex)}
          disabled={totalTickets <= 1}
          className="mt-8"
        >
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">Remove tier</span>
        </Button>
      </div>

      <FormField
        control={control}
        name={`tickets.${ticketIndex}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Textarea {...field} placeholder="Describe what this ticket includes (e.g., front row seats, free drink)." className="resize-none" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="space-y-4 rounded-md border p-4">
        <h4 className="font-medium text-sm">Location Prices & Quantities</h4>
        <FormField
          control={control}
          name={`tickets.${ticketIndex}.locationPrices`}
          render={() => <FormMessage />}
        />

        {locationPriceFields.map((field, priceIndex) => (
            <LocationPriceRow
                key={field.id}
                control={control}
                ticketIndex={ticketIndex}
                priceIndex={priceIndex}
                watchedLocations={watchedLocations}
                setValue={setValue}
            />
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => appendLocationPrice({ location: watchedLocations[0]?.value || '', price: 0, quantity: 100, free: false, maxFreeTicketsPerPhone: 5 })}
          disabled={!watchedLocations.some(l => l.value)}
        >
          <PlusCircle className="mr-2 h-4 w-4" /> Add Location Price
        </Button>
      </div>
    </Card>
  );
};


export default function CreateEventPageContent() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const form = useForm<EventFormValues>({
    resolver: zodResolver(eventFormSchema),
    defaultValues: {
      name: '',
      description: '',
      locations: [{ value: '' }],
      hint: '',
      category: '',
      otherCategory: '',
      images: [],
      tickets: [{
        name: 'General Admission',
        description: 'Standard entry to the event.',
        locationPrices: [{ location: '', price: 0, quantity: 100, free: false, maxFreeTicketsPerPhone: 5 }]
      }],
    },
  });

  const { control, getValues, setValue } = form;

  const watchedImages = form.watch('images');
  const watchedCategory = form.watch('category');
  const watchedLocations = form.watch('locations');

  const { fields: ticketFields, append: appendTicket, remove: removeTicket } = useFieldArray({
    control,
    name: "tickets"
  });

  const { fields: locationFields, append: appendLocation, remove: removeLocation } = useFieldArray({
    control,
    name: "locations"
  });

  // Sync the first ticket's location price with the first location field
  const firstLocationValue = form.watch('locations.0.value');
  useEffect(() => {
    const currentTicketLocation = form.getValues('tickets.0.locationPrices.0.location');
    if (firstLocationValue && currentTicketLocation !== firstLocationValue) {
      form.setValue('tickets.0.locationPrices.0.location', firstLocationValue, { shouldValidate: true });
    }
  }, [firstLocationValue, form]);

  async function onSubmit(data: EventFormValues) {
    setIsSubmitting(true);
    try {
        const finalData = {
          ...data,
          category: data.category === 'Other' ? data.otherCategory : data.category,
          // Ensure free toggle always results in a stored price of 0.
          tickets: data.tickets.map(t => ({
            ...t,
            locationPrices: t.locationPrices.map(lp => ({
              ...lp,
              price: lp.free ? 0 : lp.price,
            })),
          })),
        };
        const newEvent = await addEvent(finalData);

        if (newEvent.status === 'PENDING') {
            toast({
                title: 'Event Submitted!',
                description: `Your event "${data.name}" is now pending admin approval.`,
            });
            router.push('/dashboard/events');
        } else {
            toast({
                title: 'Event Created!',
                description: `Successfully created "${data.name}".`,
            });
             if (user?.role?.name === 'Admin') {
                router.push('/dashboard/events?tab=approved');
            } else {
                router.push('/dashboard/events');
            }
        }

    } catch (error: any) {
        console.error("Failed to create event:", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: error.message || 'Failed to create event. Please try again.',
        });
    } finally {
        setIsSubmitting(false);
    }
  }

 const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const files = e.target.files;
  if (files && files.length > 0) {
        setIsUploading(true);
        // Only take the first file
        const file = files[0];
        const reader = new FileReader();
        reader.onloadend = async () => {
          try {
            await ensureCsrfToken();
            const response = await api.post('/api/upload', { file: reader.result });
            if (response.data.success) {
              // Replace the existing image instead of adding to array
              form.setValue('images', [response.data.url]);
            } else {
              toast({ variant: 'destructive', title: 'Upload failed', description: response.data.error });
            }
          } catch (error) {
            toast({ variant: 'destructive', title: 'Upload failed', description: 'An error occurred during upload.' });
          } finally {
            setIsUploading(false);
          }
        };
        reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <Card>
          <CardHeader>
            <CardTitle>Create New Event</CardTitle>
            <CardDescription>Fill out the details below to create your new event.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                <FormField
                  control={control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Event Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Tech Conference 2025" {...field} />
                      </FormControl>
                      <FormDescription>
                        This is the public name of your event.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Tell us a little bit about your event"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        A brief, catchy description that will appear on the event page.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={control}
                      name="category"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Category</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select a category" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Technology">Technology</SelectItem>
                              <SelectItem value="Music">Music</SelectItem>
                              <SelectItem value="Art">Art</SelectItem>
                              <SelectItem value="Community">Community</SelectItem>
                              <SelectItem value="Business">Business</SelectItem>
                              <SelectItem value="Other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            What type of event is it?
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {watchedCategory === 'Other' && (
                      <FormField
                        control={control}
                        name="otherCategory"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Custom Category</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g., Charity, Food Festival" {...field} />
                            </FormControl>
                            <FormDescription>
                              Please specify your category.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                      control={control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>Start Date & Time</FormLabel>
                          <DateTimePicker
                            date={field.value}
                            setDate={field.onChange}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={control}
                      name="endDate"
                      render={({ field }) => (
                        <FormItem className="flex flex-col">
                          <FormLabel>End Date & Time</FormLabel>
                          <DateTimePicker
                            date={field.value}
                            setDate={field.onChange}
                          />
                          <FormDescription>
                            Optional: For multi-day events.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                </div>

                <div className="space-y-4">
                  <FormLabel>Locations</FormLabel>
                  <FormDescription>Add one or more locations for your event. Start typing to search for a location in Ethiopia.</FormDescription>
                  <FormMessage>{form.formState.errors.locations?.message}</FormMessage>

                  {locationFields.map((field, index) => (
                      <div key={field.id} className="flex items-center gap-2">
                          <FormField
                              control={control}
                              name={`locations.${index}.value`}
                              render={({ field }) => (
                                  <FormItem className="flex-grow">
                                      <FormControl>
                                          <LocationInput
                                              value={field.value}
                                              onChange={field.onChange}
                                          />
                                      </FormControl>
                                      <FormMessage />
                                  </FormItem>
                              )}
                          />
                          <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => removeLocation(index)}
                              disabled={locationFields.length <= 1}
                          >
                              <Trash2 className="h-4 w-4" />
                              <span className="sr-only">Remove location</span>
                          </Button>
                      </div>
                  ))}
                  <Button
                      type="button"
                      variant="outline"
                      onClick={() => appendLocation({ value: '' })}
                  >
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Add Location
                  </Button>
                </div>


                <FormField
                  control={control}
                  name="hint"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specific Location Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="e.g., Millennium Hall, 2nd Floor, Room 201. Near the main entrance."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Optional: Provide more detailed location info like landmarks, building names, or floor numbers. This applies to all locations.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                    <div>
                    <FormLabel>Event Image</FormLabel>
                    <FormDescription>Upload one image for your event.</FormDescription>
                    <FormMessage className="pt-2">{form.formState.errors.images?.message}</FormMessage>
                    </div>
                    <div className="flex gap-4">
                      {watchedImages.length > 0 ? (
                        <div className="relative aspect-video w-64 rounded-md overflow-hidden group">
                          <Image
                              src={watchedImages[0]}
                              alt="Event image"
                              fill
                              className="object-cover"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            onClick={() => form.setValue('images', [])}
                            >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">Remove image</span>
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      <label htmlFor="image-upload" className="aspect-video w-64 rounded-md border-dashed border-2 flex items-center justify-center cursor-pointer hover:border-primary hover:text-primary transition-colors text-muted-foreground">
                        <div className="text-center">
                            {isUploading ? (
                            <Loader2 className="h-8 w-8 animate-spin" />
                            ) : (
                            <>
                                <PlusCircle className="h-8 w-8 mx-auto" />
                                <span className="text-sm mt-2">{watchedImages.length > 0 ? 'Replace Image' : 'Add Image'}</span>
                            </>
                            )}
                        </div>
                        <Input
                            id="image-upload"
                            type="file"
                            className="sr-only"
                            accept="image/png, image/jpeg, image/gif"
                            onChange={handleFileChange}
                            disabled={isUploading}
                        />
                      </label>
                    </div>
                </div>

                <Separator />

                <div className="space-y-6">
                    <div>
                        <FormLabel>Ticket Tiers</FormLabel>
                        <FormDescription>Create one or more ticket types for your event.</FormDescription>
                        <FormMessage>{form.formState.errors.tickets?.message}</FormMessage>
                    </div>

                    {ticketFields.map((ticket, ticketIndex) => (
                      <TicketTierCard
                        key={ticket.id}
                        ticketIndex={ticketIndex}
                        control={control}
                        remove={removeTicket}
                        totalTickets={ticketFields.length}
                        watchedLocations={watchedLocations}
                        getValues={getValues}
                        setValue={setValue}
                      />
                    ))}

                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => appendTicket({
                        name: '',
                        description: '',
                        locationPrices: [{ location: watchedLocations?.[0]?.value ?? '', price: 0, quantity: 100, free: false, maxFreeTicketsPerPhone: 5 }]
                      })}
                    >
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Add Ticket Tier
                    </Button>
                </div>

                <Separator />

                <Button type="submit" disabled={isSubmitting || isUploading}>
                  {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create Event
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
