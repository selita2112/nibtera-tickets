

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useFieldArray } from 'react-hook-form';
import * as z from 'zod';
import { useRouter, useParams } from 'next/navigation';
import { UploadCloud, Loader2, ArrowLeft, PlusCircle, Trash2, X } from 'lucide-react';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import axios from 'axios';

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { updateEvent, getEventById } from '@/lib/actions';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import LocationInput from '@/components/location-input';
import { DateTimePicker } from '@/components/datetime-picker';
import { ensureCsrfToken } from '@/context/auth-context';
import api from '@/lib/api';
import { Switch } from '@/components/ui/switch';
import { getEventImageUrls } from '@/lib/event-images';

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
  images: z.array(z.string()).length(1, { message: 'Please upload exactly one image.' }),
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

const defaultCategories = ["Technology", "Music", "Art", "Community", "Business"];
const DEFAULT_IMAGE_PLACEHOLDER = '/images/nibtickets.jpg';

export default function EditEventPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const eventId = params.id ? parseInt(params.id, 10) : -1;
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
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
    },
  });


  const watchedImages = form.watch('images');

  const { fields: locationFields, append: appendLocation, remove: removeLocation } = useFieldArray({
    control: form.control,
    name: "locations"
  });

  const watchedCategory = form.watch('category');

  useEffect(() => {
    if (eventId === -1) {
      router.push('/dashboard/events');
      return;
    }

    async function fetchEvent() {
      try {
        setLoading(true);
        const event = await getEventById(eventId);
        if (event) {
          const isOtherCategory = event.category && !defaultCategories.includes(event.category);
          const eventLocations = event.location ? event.location.split('||').map((loc: string) => ({ value: loc.trim() })) : [{ value: '' }];
          const eventImages = getEventImageUrls(event.image);
          
          form.reset({
            name: event.name,
            description: event.description,
            locations: eventLocations,
            hint: event.hint || '',
            category: isOtherCategory ? 'Other' : event.category,
            otherCategory: isOtherCategory ? event.category : '',
            startDate: new Date(event.startDate),
            endDate: event.endDate ? new Date(event.endDate) : undefined,
            images: eventImages,
          });
        } else {
            toast({ variant: 'destructive', title: 'Error', description: 'Event not found.' });
            router.push('/dashboard/events');
        }
      } catch (error) {
        console.error("Failed to fetch event", error);
        toast({ variant: 'destructive', title: 'Error', description: 'Failed to load event data.' });
      } finally {
        setLoading(false);
      }
    }

    fetchEvent();
  }, [eventId, form, router, toast]);

  async function onSubmit(data: EventFormValues) {
    setIsSubmitting(true);
    try {
        const finalData = {
            ...data,
            category: data.category === 'Other' ? data.otherCategory : data.category,
            images: data.images, // Pass the array of image URLs
        };

        await updateEvent(eventId, finalData);
        toast({
            title: 'Event Updated!',
            description: `Successfully updated "${data.name}".`,
        });
        router.push(`/dashboard/events/${eventId}`);
    } catch (error) {
        console.error("Failed to update event:", error);
        toast({
            variant: 'destructive',
            title: 'Error',
            description: 'Failed to update event. Please try again.',
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

  if (loading) {
    return (
        <div className="flex flex-1 flex-col gap-4 md:gap-8 p-4 lg:p-6">
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
                    <Skeleton className="h-4 w-80" />
                </CardHeader>
                <CardContent className="space-y-8">
                   <Skeleton className="h-10 w-full" />
                   <Skeleton className="h-20 w-full" />
                   <Skeleton className="h-10 w-full" />
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
    <div className="flex flex-1 flex-col gap-4 md:gap-8">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
          <span className="sr-only">Back</span>
        </Button>
        <div>
            <h1 className="text-3xl font-bold tracking-tight">Edit Event</h1>
            <p className="text-muted-foreground">Update the details for "{form.getValues('name')}"</p>
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
                    <FormLabel>Event Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g., Tech Conference 2025" {...field} />
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
                      <Textarea
                        placeholder="Tell us a little bit about your event"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                           {defaultCategories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                           <SelectItem value="Other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {watchedCategory === 'Other' && (
                  <FormField
                    control={form.control}
                    name="otherCategory"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Custom Category</FormLabel>
                        <FormControl>
                          <Input placeholder="e.g., Charity, Food Festival" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
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
                    control={form.control}
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
                              control={form.control}
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
                control={form.control}
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
                  <FormDescription>Update the image for your event.</FormDescription>
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
                          <UploadCloud className="h-8 w-8 mx-auto" />
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

              <Button type="submit" disabled={isSubmitting || isUploading}>
                {(isSubmitting || isUploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
