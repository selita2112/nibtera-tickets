'use server';

import { cookies } from 'next/headers';
import prisma from './prisma';
import type { Role, User, Branch, District } from '@prisma/client';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

// Helper to ensure data is serializable for Client Components
const serialize = (data: any) => {
    if (!data) return null;
    return JSON.parse(JSON.stringify(data, (key, value) =>
        typeof value === 'bigint'
            ? value.toString()
            : value
    ));
}

// This is the definitive server-side function to get the current user's session.
export async function getCurrentUser(): Promise<(User & { role: Role & { permissions: string[] }; branch: (Branch & { district: District }) | null }) | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token || !JWT_SECRET) {
    return null;
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; tokenVersion?: number };

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: { 
        role: { 
          include: { 
            rolePermissions: { 
              include: { 
                permission: true 
              } 
            } 
          } 
        }, 
        branch: {
          include: {
            district: true
          }
        }
      },
    });

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return null;
    }
    
    const permissions = user.role.rolePermissions.map(p => p.permission.name);
    
    const { password: _password, ...userWithoutPassword } = user;

    const userWithPermissions = {
      ...userWithoutPassword,
      role: {
        ...user.role,
        permissions: permissions
      }
    };

    return serialize(userWithPermissions);
  } catch (error) {
    console.error('Error in getCurrentUser:', error);
    return null;
  }
}
