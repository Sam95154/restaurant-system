generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Branch {
  id            String       @id @default(uuid())
  name          String
  address       String
  city          String
  state         String
  country       String
  phone         String
  email         String
  logoUrl       String?
  openingTime   String
  closingTime   String
  weeklyHoliday String?
  status        BranchStatus @default(OPENING_SOON)
  managerId     String?      @unique
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  manager        Employee?         @relation("BranchManager", fields: [managerId], references: [id])
  categories     Category[]
  coupons        Coupon[]
  employees      Employee[]        @relation("BranchEmployees")
  items          Item[]
  orders         Order[]
  inventoryItems InventoryItem[]
  stocks         Stock[]
  stockMovements StockMovement[]
  suppliers      Supplier[]
  purchases      Purchase[]
  tables         RestaurantTable[]
  attendance     Attendance[]
  leaves         Leave[]
  expenses       Expense[]
  payrollRecords PayrollRecord[]
  settings       RestaurantSettings?
}

model RestaurantSettings {
  id                 String   @id @default(uuid())
  branchId           String   @unique
  taxEnabled         Boolean  @default(true)
  taxRate            Decimal  @default(0) @db.Decimal(5, 2)
  currency           String   @default("INR")
  receiptFooter      String?
  billPrefix         String?
  qrOrderingEnabled  Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  branch Branch @relation(fields: [branchId], references: [id], onDelete: Cascade)
}

model Employee {
  id           String       @id @default(uuid())
  fullName     String
  email        String?      @unique
  phone        String?      @unique
  loginId      String       @unique
  passwordHash String
  role         Role
  department   String?
  status       ActiveStatus @default(ACTIVE)
  joiningDate  DateTime     @default(now())
  branchId     String?
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  managesBranch    Branch?              @relation("BranchManager")
  branch           Branch?              @relation("BranchEmployees", fields: [branchId], references: [id])
  createdExpenses  Expense[]
  permissions      EmployeePermission[]
  kitchenOrders    Order[]              @relation("KitchenEmployeeOrders")
  ordersTaken      Order[]              @relation("ServiceEmployeeOrders")
  attendance       Attendance[]
  leaves           Leave[]
  salaryStructures SalaryStructure[]
  payrollRecords   PayrollRecord[]
}

model Permission {
  id        String               @id @default(uuid())
  key       String               @unique
  employees EmployeePermission[]
}

model EmployeePermission {
  id           String @id @default(uuid())
  employeeId   String
  permissionId String

  employee   Employee   @relation(fields: [employeeId], references: [id])
  permission Permission @relation(fields: [permissionId], references: [id])

  @@unique([employeeId, permissionId])
}

model Customer {
  id        String   @id @default(uuid())
  fullName  String?
  email     String?  @unique
  phone     String?  @unique
  createdAt DateTime @default(now())

  orders  Order[]
  otps    OtpCode[]
  reviews Review[]
}

model OtpCode {
  id         String   @id @default(uuid())
  customerId String
  codeHash   String
  channel    String
  expiresAt  DateTime
  attempts   Int      @default(0)
  consumed   Boolean  @default(false)
  createdAt  DateTime @default(now())

  customer Customer @relation(fields: [customerId], references: [id])

  @@index([customerId])
}

model Category {
  id          String       @id @default(uuid())
  name        String
  description String?
  image       String?
  status      ActiveStatus @default(ACTIVE)
  branchId    String

  branch Branch @relation(fields: [branchId], references: [id])
  items  Item[]

  @@unique([branchId, name])
}

model Item {
  id              String       @id @default(uuid())
  name            String
  description     String?
  price           Decimal
  discount        Decimal      @default(0)
  ingredients     String?
  preparationTime Int?
  status          ActiveStatus @default(ACTIVE)
  categoryId      String
  branchId        String
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  branch     Branch      @relation(fields: [branchId], references: [id])
  category   Category    @relation(fields: [categoryId], references: [id])
  images     ItemImage[]
  orderItems OrderItem[]
}

model ItemImage {
  id        String  @id @default(uuid())
  itemId    String
  url       String
  isPrimary Boolean @default(false)

  item Item @relation(fields: [itemId], references: [id])
}

model RestaurantTable {
  id       String      @id @default(uuid())
  number   Int
  capacity Int
  status   TableStatus @default(AVAILABLE)
  branchId String

  branch   Branch         @relation(fields: [branchId], references: [id])
  sessions TableSession[]

  @@unique([branchId, number])
}

model TableSession {
  id       String        @id @default(uuid())
  status   SessionStatus @default(OPEN)
  openedAt DateTime      @default(now())
  closedAt DateTime?
  tableId  String

  bills  Bill[]
  orders Order[]
  table  RestaurantTable @relation(fields: [tableId], references: [id])
}

model Order {
  id                  String      @id @default(uuid())
  orderNumber         Int         @default(autoincrement())
  type                OrderType
  status              OrderStatus @default(PENDING)
  specialInstructions String?
  branchId            String
  tableSessionId      String?
  customerId          String?
  serviceEmployeeId   String?
  kitchenEmployeeId   String?
  couponId            String?
  subtotal            Decimal     @default(0)
  discountAmount      Decimal     @default(0)
  taxAmount           Decimal     @default(0)
  total               Decimal     @default(0)
  createdAt           DateTime    @default(now())
  updatedAt           DateTime    @updatedAt

  billItems       BillItem[]
  branch          Branch               @relation(fields: [branchId], references: [id])
  coupon          Coupon?              @relation(fields: [couponId], references: [id])
  customer        Customer?            @relation(fields: [customerId], references: [id])
  kitchenEmployee Employee?            @relation("KitchenEmployeeOrders", fields: [kitchenEmployeeId], references: [id])
  serviceEmployee Employee?            @relation("ServiceEmployeeOrders", fields: [serviceEmployeeId], references: [id])
  tableSession    TableSession?        @relation(fields: [tableSessionId], references: [id])
  items           OrderItem[]
  statusHistory   OrderStatusHistory[]
}

model OrderItem {
  id            String  @id @default(uuid())
  orderId       String
  itemId        String
  nameSnapshot  String
  priceSnapshot Decimal
  quantity      Int

  item  Item  @relation(fields: [itemId], references: [id])
  order Order @relation(fields: [orderId], references: [id])
}

model OrderStatusHistory {
  id        String      @id @default(uuid())
  orderId   String
  status    OrderStatus
  changedBy String?
  changedAt DateTime    @default(now())

  order Order @relation(fields: [orderId], references: [id])
}

model Coupon {
  id               String       @id @default(uuid())
  code             String       @unique
  description      String?
  discountType     DiscountType
  discountValue    Decimal
  minOrder         Decimal      @default(0)
  maxDiscount      Decimal?
  startDate        DateTime
  expiryDate       DateTime
  usageLimit       Int?
  perCustomerLimit Int?
  status           ActiveStatus @default(ACTIVE)
  branchId         String?

  branch Branch?       @relation(fields: [branchId], references: [id])
  usages CouponUsage[]
  orders Order[]
}

model CouponUsage {
  id         String   @id @default(uuid())
  couponId   String
  customerId String?
  usedAt     DateTime @default(now())

  coupon Coupon @relation(fields: [couponId], references: [id])

  @@index([customerId])
  @@index([couponId])
}

model Bill {
  id             String        @id @default(uuid())
  billNumber     Int           @default(autoincrement())
  subtotal       Decimal
  discount       Decimal       @default(0)
  tax            Decimal       @default(0)
  total          Decimal
  paymentStatus  PaymentStatus @default(UNPAID)
  generatedById  String?
  tableSessionId String?
  createdAt      DateTime      @default(now())

  tableSession TableSession? @relation(fields: [tableSessionId], references: [id])
  items        BillItem[]
  payments     Payment[]
}

model BillItem {
  id      String @id @default(uuid())
  billId  String
  orderId String

  bill  Bill  @relation(fields: [billId], references: [id])
  order Order @relation(fields: [orderId], references: [id])
}

model Payment {
  id           String        @id @default(uuid())
  billId       String
  amount       Decimal
  method       PaymentMethod
  recordedById String?
  recordedAt   DateTime      @default(now())

  bill Bill @relation(fields: [billId], references: [id])
}

model Review {
  id               String   @id @default(uuid())
  customerId       String
  orderId          String?
  itemRating       Int?
  restaurantRating Int?
  text             String?
  approved         Boolean  @default(true)
  createdAt        DateTime @default(now())

  customer Customer @relation(fields: [customerId], references: [id])
}

model Notification {
  id            String   @id @default(uuid())
  userId        String
  userType      String
  type          String
  title         String
  message       String
  relatedEntity String?
  read          Boolean  @default(false)
  createdAt     DateTime @default(now())

  @@index([userId, userType])
}

model AuditLog {
  id        String   @id @default(uuid())
  userId    String?
  userRole  String?
  action    String
  entity    String
  entityId  String?
  metadata  Json?
  createdAt DateTime @default(now())
}

enum Role {
  SUPER_ADMIN
  MANAGER
  SERVICE_EMPLOYEE
  KITCHEN_EMPLOYEE
  BILLING_EMPLOYEE
}

enum BranchStatus {
  OPENING_SOON
  OPEN
  CLOSED
  TEMPORARILY_CLOSED
  PERMANENTLY_CLOSED
}

enum TableStatus {
  AVAILABLE
  OCCUPIED
  RESERVED
  CLEANING
  OUT_OF_SERVICE
}

enum SessionStatus {
  OPEN
  CLOSED
}

enum OrderType {
  STAFF_ORDER
  SELF_ORDER
  TAKEAWAY
}

enum OrderStatus {
  PENDING
  ACCEPTED
  PREPARING
  READY
  SERVED
  COMPLETED
  CANCELLED
}

enum DiscountType {
  PERCENTAGE
  FIXED_AMOUNT
}

enum PaymentStatus {
  UNPAID
  PARTIALLY_PAID
  PAID
  REFUNDED
}

enum PaymentMethod {
  CASH
  UPI
  CARD
  OTHER
}

enum ActiveStatus {
  ACTIVE
  INACTIVE
}

enum InventoryUnit {
  KG
  GRAM
  LITRE
  ML
  PIECE
  PACK
  BOX
  BOTTLE
  OTHER
}

enum StockMovementType {
  PURCHASE
  SALE
  ADJUSTMENT_IN
  ADJUSTMENT_OUT
  WASTAGE
  RETURN
}

enum PurchaseStatus {
  DRAFT
  RECEIVED
  CANCELLED
}

enum AttendanceStatus {
  PRESENT
  ABSENT
  LATE
  HALF_DAY
  LEAVE
}

enum LeaveStatus {
  PENDING
  APPROVED
  REJECTED
  CANCELLED
}

model InventoryItem {
  id           String        @id @default(uuid())
  name         String
  sku          String?
  description  String?
  unit         InventoryUnit
  reorderLevel Decimal       @default(0)
  status       ActiveStatus  @default(ACTIVE)
  branchId     String
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  branch        Branch          @relation(fields: [branchId], references: [id])
  stocks        Stock[]
  movements     StockMovement[]
  purchaseItems PurchaseItem[]

  @@unique([branchId, sku])
  @@index([branchId])
  @@index([name])
}

model Stock {
  id              String   @id @default(uuid())
  quantity        Decimal  @default(0)
  averageCost     Decimal  @default(0)
  branchId        String
  inventoryItemId String
  updatedAt       DateTime @updatedAt

  branch        Branch        @relation(fields: [branchId], references: [id])
  inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id])

  @@unique([branchId, inventoryItemId])
  @@index([branchId])
  @@index([inventoryItemId])
}

model StockMovement {
  id              String            @id @default(uuid())
  type            StockMovementType
  quantity        Decimal
  unitCost        Decimal?
  referenceType   String?
  referenceId     String?
  notes           String?
  branchId        String
  inventoryItemId String
  createdById     String?
  createdAt       DateTime          @default(now())

  branch        Branch        @relation(fields: [branchId], references: [id])
  inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id])

  @@index([branchId])
  @@index([inventoryItemId])
  @@index([createdAt])
}

model Supplier {
  id          String       @id @default(uuid())
  name        String
  contactName String?
  phone       String?
  email       String?
  address     String?
  gstNumber   String?
  status      ActiveStatus @default(ACTIVE)
  branchId    String
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  branch    Branch     @relation(fields: [branchId], references: [id])
  purchases Purchase[]

  @@unique([branchId, name])
  @@index([branchId])
}

model Purchase {
  id             String         @id @default(uuid())
  purchaseNumber Int            @default(autoincrement())
  invoiceNumber  String?
  purchaseDate   DateTime       @default(now())
  status         PurchaseStatus @default(DRAFT)
  subtotal       Decimal        @default(0)
  tax            Decimal        @default(0)
  total          Decimal        @default(0)
  notes          String?
  branchId       String
  supplierId     String
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  branch   Branch         @relation(fields: [branchId], references: [id])
  supplier Supplier       @relation(fields: [supplierId], references: [id])
  items    PurchaseItem[]

  @@index([branchId])
  @@index([supplierId])
  @@index([purchaseDate])
}

model PurchaseItem {
  id              String   @id @default(uuid())
  quantity        Decimal
  unitCost        Decimal
  totalCost       Decimal
  purchaseId      String
  inventoryItemId String
  createdAt       DateTime @default(now())

  purchase      Purchase      @relation(fields: [purchaseId], references: [id])
  inventoryItem InventoryItem @relation(fields: [inventoryItemId], references: [id])

  @@index([purchaseId])
  @@index([inventoryItemId])
}

model Attendance {
  id           String           @id @default(uuid())
  employeeId   String
  branchId     String
  date         DateTime         @db.Date
  status       AttendanceStatus @default(PRESENT)
  checkIn      DateTime?
  checkOut     DateTime?
  workingHours Decimal?
  remarks      String?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  employee Employee @relation(fields: [employeeId], references: [id])
  branch   Branch   @relation(fields: [branchId], references: [id])

  @@unique([employeeId, date])
  @@index([branchId, date])
  @@index([employeeId, date])
}

model Leave {
  id         String      @id @default(uuid())
  employeeId String
  branchId   String
  startDate  DateTime    @db.Date
  endDate    DateTime    @db.Date
  status     LeaveStatus @default(PENDING)
  reason     String?
  remarks    String?
  createdAt  DateTime    @default(now())
  updatedAt  DateTime    @updatedAt

  employee Employee @relation(fields: [employeeId], references: [id])
  branch   Branch   @relation(fields: [branchId], references: [id])

  @@index([employeeId, startDate])
  @@index([branchId, startDate])
  @@index([branchId, endDate])
}

model Expense {
  id            String        @id @default(uuid())
  branchId      String
  createdById   String
  category      String
  amount        Decimal       @db.Decimal(12, 2)
  expenseDate   DateTime      @db.Date
  paymentMethod PaymentMethod @default(CASH)
  description   String?
  receiptUrl    String?
  status        ExpenseStatus @default(ACTIVE)
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  branch    Branch   @relation(fields: [branchId], references: [id])
  createdBy Employee @relation(fields: [createdById], references: [id])

  @@index([branchId, expenseDate])
  @@index([createdById, expenseDate])
  @@index([category, expenseDate])
}

enum ExpenseStatus {
  ACTIVE
  CANCELLED
}

model SalaryStructure {
  id            String    @id @default(uuid())
  employeeId    String
  basicSalary   Decimal   @db.Decimal(12, 2)
  allowances    Decimal   @default(0) @db.Decimal(12, 2)
  overtimeRate  Decimal   @default(0) @db.Decimal(12, 2)
  deductions    Decimal   @default(0) @db.Decimal(12, 2)
  effectiveFrom DateTime  @db.Date
  effectiveTo   DateTime? @db.Date
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  employee Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)

  @@index([employeeId, effectiveFrom])
  @@index([employeeId, isActive])
}

model PayrollRecord {
  id           String   @id @default(uuid())
  employeeId   String
  branchId     String
  payrollMonth DateTime @db.Date

  basicSalary    Decimal @db.Decimal(12, 2)
  allowances     Decimal @default(0) @db.Decimal(12, 2)
  overtimeAmount Decimal @default(0) @db.Decimal(12, 2)
  grossSalary    Decimal @db.Decimal(12, 2)

  absenceDeduction Decimal @default(0) @db.Decimal(12, 2)
  otherDeductions  Decimal @default(0) @db.Decimal(12, 2)
  totalDeductions  Decimal @default(0) @db.Decimal(12, 2)

  netSalary Decimal @db.Decimal(12, 2)

  workingDays   Int           @default(0)
  presentDays   Decimal       @default(0) @db.Decimal(5, 2)
  absentDays    Decimal       @default(0) @db.Decimal(5, 2)
  leaveDays     Decimal       @default(0) @db.Decimal(5, 2)
  halfDays      Decimal       @default(0) @db.Decimal(5, 2)
  overtimeHours Decimal       @default(0) @db.Decimal(8, 2)
  payrollMode   PayrollMode   @default(MANUAL)
  status        PayrollStatus @default(DRAFT)

  calculatedAt DateTime?
  reviewedAt   DateTime?
  approvedAt   DateTime?
  lockedAt     DateTime?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  employee Employee @relation(fields: [employeeId], references: [id])
  branch   Branch   @relation(fields: [branchId], references: [id])

  @@unique([employeeId, payrollMonth])
  @@index([branchId, payrollMonth])
  @@index([employeeId, payrollMonth])
  @@index([status, payrollMonth])
}

enum PayrollStatus {
  DRAFT
  CALCULATED
  REVIEWED
  APPROVED
  LOCKED
}

enum PayrollMode {
  MANUAL
}
