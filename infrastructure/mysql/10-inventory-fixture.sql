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
  ('SYN-MISSING-006','Toyota','Unknown Model',2020,NULL,45000,'Petrol',NULL,NULL,NULL,NULL,NULL,'Synthetic vehicle with intentionally missing optional facts.',NULL)
ON DUPLICATE KEY UPDATE make=VALUES(make);

REVOKE ALL PRIVILEGES, GRANT OPTION FROM 'carvix_inventory_reader'@'%';
GRANT SELECT ON carvix_inventory_fixture.vehicles TO 'carvix_inventory_reader'@'%';
