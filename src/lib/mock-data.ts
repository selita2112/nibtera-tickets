// This file is no longer in use. Data is now fetched from the database via Prisma.

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}
