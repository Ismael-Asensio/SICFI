mkdir -p api/{src,prisma,test}

cd api

cat > package.json <<'APIJSON'
{
  "name": "@sicfi/api",
  "version": "0.0.1",
  "description": "SICFI Backend API (NestJS)",
  "author": "Ismael Asensio",
  "private": true,
  "engines": {
    "node": ">=22.0.0"
  },
  "scripts": {
    "dev": "nest start --watch",
    "start": "nest start",
    "build": "nest build",
    "lint": "eslint src --ext .ts",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:domain": "jest --testPathPattern=domain",
    "test:integration": "jest --testPathPattern=integration",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "test:tenant": "jest --testNamePattern=tenant",
    "db:migrate": "prisma migrate dev",
    "db:deploy": "prisma migrate deploy",
    "db:seed": "ts-node prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "dependencies": {
    "@nestjs/common": "^10.4.1",
    "@nestjs/core": "^10.4.1",
    "@nestjs/platform-express": "^10.4.1",
    "reflect-metadata": "^0.1.14",
    "rxjs": "^7.8.2",
    "@prisma/client": "^5.21.0",
    "decimal.js": "^10.4.3",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.4.2",
    "@nestjs/schematics": "^10.1.2",
    "@types/node": "^22.10.5",
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.14",
    "@typescript-eslint/eslint-plugin": "^8.20.0",
    "@typescript-eslint/parser": "^8.20.0",
    "eslint": "^9.20.0",
    "typescript": "^5.7.2",
    "jest": "^29.7.0",
    "ts-jest": "^29.2.6",
    "ts-loader": "^9.5.1",
    "prisma": "^5.21.0",
    "ts-node": "^10.9.2"
  }
}
APIJSON

cat > tsconfig.json <<'TSJSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "moduleResolution": "node",
    "allowSyntheticDefaultImports": true,
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
TSJSON

mkdir -p src

cat > src/main.ts <<'MAIN'
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  await app.listen(3001);
  console.log(`API running on http://localhost:3001/api/v1`);
}

bootstrap();
MAIN

cat > src/app.module.ts <<'APPMOD'
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
APPMOD

cat > src/app.controller.ts <<'APPCTR'
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('health')
  getHealth() {
    return this.appService.getHealth();
  }
}
APPCTR

cat > src/app.service.ts <<'APPSVC'
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth() {
    return { status: 'ok' };
  }
}
APPSVC

echo "API structure created"
