'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowLeft,
  ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

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
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import api from '@/lib/api';
import { ensureCsrfToken } from '@/context/auth-context';
import {
  createHomeCarouselAd,
  deleteHomeCarouselAd,
  getHomeCarouselAdsAdmin,
  updateHomeCarouselAd,
} from '@/lib/actions';
import { useRouter } from 'next/navigation';

type HomeCarouselAdRow = {
  id: number;
  imageUrl: string;
  title: string | null;
  caption: string | null;
  linkUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

const emptyForm = {
  imageUrl: '',
  title: '',
  caption: '',
  linkUrl: '',
  sortOrder: 0,
  isActive: true,
};

export default function HomeAdsSettingsPageContent() {
  const { toast } = useToast();
  const router = useRouter();
  const [ads, setAds] = useState<HomeCarouselAdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HomeCarouselAdRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HomeCarouselAdRow | null>(null);

  const loadAds = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await getHomeCarouselAdsAdmin();
      setAds(rows as HomeCarouselAdRow[]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Could not load carousel ads.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, sortOrder: ads.length });
    setDialogOpen(true);
  };

  const openEdit = (row: HomeCarouselAdRow) => {
    setEditing(row);
    setForm({
      imageUrl: row.imageUrl,
      title: row.title ?? '',
      caption: row.caption ?? '',
      linkUrl: row.linkUrl ?? '',
      sortOrder: row.sortOrder,
      isActive: row.isActive,
    });
    setDialogOpen(true);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    const file = files[0];
    setUploading(true);
    try {
      await ensureCsrfToken();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('Failed to read file.'));
        reader.readAsDataURL(file);
      });
      const response = await api.post('/api/upload', { file: dataUrl });
      if (!response.data.success) {
        throw new Error(response.data.error || 'Upload failed.');
      }
      setForm((f) => ({ ...f, imageUrl: response.data.url as string }));
      toast({ title: 'Image uploaded' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      toast({ variant: 'destructive', title: 'Upload failed', description: message });
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    if (!form.imageUrl.trim()) {
      toast({
        variant: 'destructive',
        title: 'Image required',
        description: 'Upload an image before saving.',
      });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateHomeCarouselAd(editing.id, {
          imageUrl: form.imageUrl.trim(),
          title: form.title.trim() || null,
          caption: form.caption.trim() || null,
          linkUrl: form.linkUrl.trim() || null,
          sortOrder: Number(form.sortOrder),
          isActive: form.isActive,
        });
        toast({ title: 'Carousel ad updated' });
      } else {
        await createHomeCarouselAd({
          imageUrl: form.imageUrl.trim(),
          title: form.title.trim() || null,
          caption: form.caption.trim() || null,
          linkUrl: form.linkUrl.trim() || null,
          sortOrder: Number.isFinite(Number(form.sortOrder)) ? Number(form.sortOrder) : undefined,
          isActive: form.isActive,
        });
        toast({ title: 'Carousel ad created' });
      }
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
      await loadAds();
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Save failed.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (row: HomeCarouselAdRow, isActive: boolean) => {
    try {
      await updateHomeCarouselAd(row.id, { isActive });
      setAds((prev) =>
        prev.map((a) => (a.id === row.id ? { ...a, isActive } : a))
      );
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteHomeCarouselAd(deleteTarget.id);
      toast({ title: 'Carousel ad removed' });
      setDeleteTarget(null);
      await loadAds();
      router.refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed.';
      toast({ variant: 'destructive', title: 'Error', description: message });
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/dashboard/settings" aria-label="Back to settings">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-3">
            <ImageIcon className="h-8 w-8" />
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Homepage carousel</h1>
              <p className="text-muted-foreground text-sm">
                Promotional slides on the public homepage. Separate from event images.
              </p>
            </div>
          </div>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add slide
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Slides</CardTitle>
          <CardDescription>
            Only active slides appear on the homepage. Order is lowest first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ads.length === 0 ? (
            <p className="text-muted-foreground text-sm py-8 text-center">
              No slides yet. Add one to replace the default placeholder on the homepage.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">Preview</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Link</TableHead>
                  <TableHead className="w-[90px]">Order</TableHead>
                  <TableHead className="w-[100px]">Active</TableHead>
                  <TableHead className="w-[120px] text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ads.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <div className="relative h-14 w-24 overflow-hidden rounded border bg-muted">
                        <Image
                          src={row.imageUrl}
                          alt=""
                          fill
                          className="object-cover"
                          unoptimized={row.imageUrl.startsWith('data:')}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium max-w-[200px] truncate">
                        {row.title || '—'}
                      </div>
                      {row.caption && (
                        <div className="text-xs text-muted-foreground max-w-[240px] line-clamp-2">
                          {row.caption}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                      {row.linkUrl || '—'}
                    </TableCell>
                    <TableCell>{row.sortOrder}</TableCell>
                    <TableCell>
                      <Switch
                        checked={row.isActive}
                        onCheckedChange={(v) => handleToggleActive(row, v)}
                        aria-label={`Active ${row.id}`}
                      />
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEdit(row)}
                        aria-label="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(row)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit slide' : 'New slide'}</DialogTitle>
            <DialogDescription>
              Upload an image and optionally add text and a link (internal path or full URL).
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label>Image</Label>
              <div className="flex flex-wrap items-center gap-3">
                {form.imageUrl ? (
                  <div className="relative h-28 w-44 overflow-hidden rounded-md border">
                    <Image
                      src={form.imageUrl}
                      alt="Preview"
                      fill
                      className="object-cover"
                      unoptimized={form.imageUrl.startsWith('data:')}
                    />
                  </div>
                ) : (
                  <div className="flex h-28 w-44 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">
                    No image
                  </div>
                )}
                <div>
                  <Input
                    type="file"
                    accept="image/*"
                    className="max-w-[220px]"
                    disabled={uploading}
                    onChange={handleUpload}
                  />
                  {uploading && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Uploading…
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ad-title">Title (optional)</Label>
              <Input
                id="ad-title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Short headline"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ad-caption">Caption (optional)</Label>
              <Textarea
                id="ad-caption"
                value={form.caption}
                onChange={(e) => setForm((f) => ({ ...f, caption: e.target.value }))}
                placeholder="Supporting text"
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ad-link">Link (optional)</Label>
              <Input
                id="ad-link"
                value={form.linkUrl}
                onChange={(e) => setForm((f) => ({ ...f, linkUrl: e.target.value }))}
                placeholder="/events/123 or https://…"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ad-order">Sort order</Label>
              <Input
                id="ad-order"
                type="number"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))
                }
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor="ad-active">Active</Label>
                <p className="text-xs text-muted-foreground">
                  Inactive slides are hidden on the homepage.
                </p>
              </div>
              <Switch
                id="ad-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} type="button">
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || uploading} type="button">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this slide?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes it from the homepage carousel. The image file is not deleted from storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
