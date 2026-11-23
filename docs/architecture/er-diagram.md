# Entity Relationship Diagram

```mermaid
erDiagram
    TENANT ||--o| DEALERSHIP : has
    TENANT ||--o{ BRANCH : owns
    DEALERSHIP ||--o{ BRANCH : contains
    USER ||--o{ TENANT_MEMBERSHIP : holds
    TENANT ||--o{ TENANT_MEMBERSHIP : includes
    USER ||--o| PLATFORM_ADMINISTRATOR : may-have

    TENANT {
        uuid id PK
        text name
        text slug UK
        enum status
        datetime createdAt
        datetime updatedAt
    }

    DEALERSHIP {
        uuid id PK
        uuid tenantId FK UK
        text businessName
        text contactEmail
        text contactPhone
        text country
        text timezone
        text currency
        datetime createdAt
        datetime updatedAt
    }

    BRANCH {
        uuid id PK
        uuid tenantId FK
        uuid dealershipId FK
        text name
        text code
        enum status
        datetime createdAt
        datetime updatedAt
    }

    USER {
        uuid id PK
        uuid tenantId FK "transitional compatibility"
        text email
        text name
        enum status
        datetime createdAt
        datetime updatedAt
    }

    TENANT_MEMBERSHIP {
        uuid id PK
        uuid userId FK
        uuid tenantId FK
        enum role
        enum status
        datetime createdAt
        datetime updatedAt
    }

    PLATFORM_ADMINISTRATOR {
        uuid id PK
        uuid userId FK UK
        enum role
        enum status
        datetime createdAt
        datetime updatedAt
    }
```
