namespace acp.demo;

entity Vendor {
  key ID       : String(20);
      name     : String(200);
      category : String(100);
      country  : String(10);
      rating   : Decimal(3, 1);
}

entity PurchaseOrder {
  key ID          : String(20);
      vendor      : Association to Vendor;
      amount      : Decimal(15, 2);
      currency    : String(3);
      status      : String(20);
      orderDate   : Date;
      buyer       : String(100);
      description : String(500);
      items       : Composition of many POItem on items.po = $self;
}

entity POItem {
  key ID          : String(30);
      po          : Association to PurchaseOrder;
      lineNo      : Integer;
      description : String(500);
      quantity    : Decimal(15, 3);
      unit        : String(20);
      unitPrice   : Decimal(15, 2);
      currency    : String(3);
}

entity InvoiceHeader {
  key ID          : String(20);
      po          : Association to PurchaseOrder;
      amount        : Decimal(15, 2);
      currency      : String(3);
      status        : String(20);
      invoiceDate   : Date;
      dueDate       : Date;
      invoiceRef    : String(100);
      items         : Composition of many InvoiceItem on items.invoice = $self;
}

entity InvoiceItem {
  key ID          : String(30);
      invoice     : Association to InvoiceHeader;
      lineNo      : Integer;
      description : String(500);
      quantity    : Decimal(15, 3);
      unit        : String(20);
      unitPrice   : Decimal(15, 2);
      currency    : String(3);
}
