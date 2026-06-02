/**
 * Role-Based Access Control
 * Permissions are defined per role. The `permissions` JSONB column on `staff`
 * can override defaults per staff member.
 */

export type Permission =
  | 'view_financials'      // invoices, payments, accounts
  | 'manage_invoices'      // create/edit/delete invoices
  | 'view_payroll'         // see payroll data
  | 'manage_payroll'       // edit payroll
  | 'manage_customers'     // create/edit customers
  | 'manage_staff'         // HR, create/edit staff
  | 'manage_deliveries'    // create/assign deliveries
  | 'view_reports'         // reports & executive view
  | 'manage_settings'      // system settings
  | 'approve_expenses'     // approve expense claims
  | 'manage_procurement'   // purchase orders
  | 'view_all_data'        // unrestricted read

const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  admin: [
    'view_financials','manage_invoices','view_payroll','manage_payroll',
    'manage_customers','manage_staff','manage_deliveries','view_reports',
    'manage_settings','approve_expenses','manage_procurement','view_all_data',
  ],
  manager: [
    'view_financials','manage_invoices','view_payroll',
    'manage_customers','manage_deliveries','view_reports',
    'approve_expenses','manage_procurement','view_all_data',
  ],
  sales: [
    'manage_customers','view_reports','view_all_data',
  ],
  driver: [
    'manage_deliveries',
  ],
  cleaner: [],
  finance: [
    'view_financials','manage_invoices','view_payroll','manage_payroll',
    'view_reports','manage_procurement',
  ],
}

export interface StaffWithPermissions {
  id: string
  role: string
  permissions?: Record<string, boolean>
}

export function hasPermission(staff: StaffWithPermissions | null, permission: Permission): boolean {
  if (!staff) return false
  // Check explicit override first
  if (staff.permissions?.[permission] === true) return true
  if (staff.permissions?.[permission] === false) return false
  // Fall back to role defaults
  return (ROLE_PERMISSIONS[staff.role] ?? []).includes(permission)
}

export function getPermissions(staff: StaffWithPermissions | null): Permission[] {
  if (!staff) return []
  const base = ROLE_PERMISSIONS[staff.role] ?? []
  const overrides = staff.permissions ?? {}
  const all = new Set<Permission>(base)
  for (const [key, val] of Object.entries(overrides)) {
    if (val) all.add(key as Permission)
    else all.delete(key as Permission)
  }
  return Array.from(all)
}
