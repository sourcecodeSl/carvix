CREATE TABLE IF NOT EXISTS vehicles (
  id VARCHAR(64) PRIMARY KEY,
  make VARCHAR(64) NOT NULL,
  model VARCHAR(64) NOT NULL,
  year SMALLINT,
  price_lkr DECIMAL(14,2),
  mileage INT,
  fuel_type VARCHAR(32),
  transmission VARCHAR(32),
  condition_name VARCHAR(32),
  body_type VARCHAR(32),
  color VARCHAR(32),
  availability VARCHAR(32),
  description TEXT,
  image_urls TEXT
) ENGINE=InnoDB;

INSERT INTO vehicles (
  id, make, model, year, price_lkr, mileage, fuel_type, transmission,
  condition_name, body_type, color, availability, description, image_urls
) VALUES
  ('SYN-TOY-001','Toyota','Corolla',2022,8950000.00,32000,'Petrol','Automatic','Used','Sedan','Silver','AVAILABLE','Synthetic test vehicle for local development.',NULL),
  ('SYN-HON-002','Honda','Civic',2023,11250000.00,18000,'Petrol','Automatic','Used','Sedan','Blue','AVAILABLE','Synthetic test vehicle for local development.',NULL),
  ('SYN-SUZ-003','Suzuki','Swift',2021,6750000.00,41000,'Petrol','Manual','Used','Hatchback','Red','RESERVED','Synthetic test vehicle for local development.',NULL),
  ('SYN-NIS-004','Nissan','X-Trail',2020,14500000.00,55000,'Hybrid','Automatic','Used','SUV','White','AVAILABLE','Synthetic test vehicle for local development.',NULL),
  ('SYN-TOY-005','Toyota','Prius',2022,9800000.00,27000,'Hybrid','Automatic','Used','Hatchback','Black','SOLD','Synthetic test vehicle for local development.',NULL),
  ('SYN-MISSING-006','Toyota','Unknown Model',2020,NULL,45000,'Petrol',NULL,NULL,NULL,NULL,NULL,'Synthetic vehicle with intentionally missing optional facts.',NULL),
  ('SYN-TOY-AQUA-007','Toyota','Aqua',2021,6200000.00,34000,'Hybrid','Automatic','Used','Hatchback','Blue','AVAILABLE','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-HON-FIT-008','Honda','Fit',2022,5900000.00,29000,'Hybrid','Automatic','Used','Hatchback','White','AVAILABLE','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-SUZ-WAGON-009','Suzuki','Wagon R',2021,4850000.00,22000,'Petrol','Automatic','Used','Hatchback','Silver','RESERVED','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-NIS-LEAF-010','Nissan','Leaf',2020,7750000.00,40000,'Electric','Automatic','Used','Hatchback','Gray','AVAILABLE','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-MAZ-AXELA-011','Mazda','Axela',2019,8300000.00,58000,'Petrol','Automatic','Used','Sedan','Red','SOLD','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-MIT-OUTLANDER-012','Mitsubishi','Outlander',2021,16500000.00,39000,'Hybrid','Automatic','Used','SUV','Black','AVAILABLE','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-HYU-TUCSON-013','Hyundai','Tucson',2022,14800000.00,24000,'Petrol','Automatic','Used','SUV','White','AVAILABLE','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-KIA-SPORTAGE-014','Kia','Sportage',2021,13500000.00,33000,'Diesel','Automatic','Used','SUV','Gray','RESERVED','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-TOY-VITZ-015','Toyota','Vitz',2019,5250000.00,61000,'Petrol','Automatic','Used','Hatchback','White','AVAILABLE','Fictional Carvix trial inventory vehicle.',NULL),
  ('SYN-HON-VEZEL-016','Honda','Vezel',2023,15200000.00,12000,'Hybrid','Automatic','Used','SUV','Blue','AVAILABLE','Fictional Carvix trial inventory vehicle.',NULL)
ON DUPLICATE KEY UPDATE make=VALUES(make);

REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'carvix_inventory_reader'@'%';
GRANT SELECT ON carvix_inventory_fixture.vehicles TO 'carvix_inventory_reader'@'%';
