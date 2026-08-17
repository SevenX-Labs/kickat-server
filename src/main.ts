import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import { json, urlencoded } from 'express';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

function validateEnvironment(logger: Logger, isProduction: boolean) {
  const insecureDefaults = [
    'default-access-secret',
    'default-refresh-secret',
    'kickat_super_secret_access_key_2026',
    'kickat_super_secret_refresh_key_2026',
  ];

  if (!process.env.DATABASE_URL && !process.env.DIRECT_URL) {
    const errorMsg =
      'DATABASE_URL or DIRECT_URL is required to initialize the database connection.';
    if (isProduction) {
      throw new Error(`[FATAL ENVIRONMENT ERROR]: ${errorMsg}`);
    } else {
      logger.warn(`[CONFIG WARNING]: ${errorMsg}`);
    }
  }

  const accessSecret = process.env.JWT_ACCESS_SECRET;
  const refreshSecret = process.env.JWT_REFRESH_SECRET;

  if (isProduction) {
    if (
      !accessSecret ||
      insecureDefaults.includes(accessSecret) ||
      accessSecret.length < 32
    ) {
      throw new Error(
        '[FATAL SECURITY CONFIGURATION ERROR]: JWT_ACCESS_SECRET is unset, matches a known development default, or is shorter than 32 characters in production!',
      );
    }
    if (
      !refreshSecret ||
      insecureDefaults.includes(refreshSecret) ||
      refreshSecret.length < 32
    ) {
      throw new Error(
        '[FATAL SECURITY CONFIGURATION ERROR]: JWT_REFRESH_SECRET is unset, matches a known development default, or is shorter than 32 characters in production!',
      );
    }
  } else {
    if (!accessSecret || insecureDefaults.includes(accessSecret)) {
      logger.warn(
        '[DEV CONFIG WARNING]: JWT_ACCESS_SECRET is unset or using a development fallback. Set a secure key in .env.',
      );
    }
    if (!refreshSecret || insecureDefaults.includes(refreshSecret)) {
      logger.warn(
        '[DEV CONFIG WARNING]: JWT_REFRESH_SECRET is unset or using a development fallback. Set a secure key in .env.',
      );
    }
  }
}

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const isProduction = process.env.NODE_ENV === 'production';

  // Validate environment variables and enforce production security criteria
  validateEnvironment(logger, isProduction);

  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Enable trust proxy when behind reverse proxy (Nginx / ALB / Cloudflare)
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set('trust proxy', 1);

  // Register HTTP security headers with Helmet
  app.use(
    helmet({
      hidePoweredBy: true,
      xContentTypeOptions: true,
      xFrameOptions: { action: 'deny' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false, // Keep disabled to allow Swagger UI & Razorpay modal integrations
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );

  // Response compression
  app.use(compression());

  // Request body resource limits
  app.use(json({ limit: '2mb' }));
  app.use(urlencoded({ extended: true, limit: '2mb' }));

  app.setGlobalPrefix('api/v1', {
    exclude: ['/', 'health', 'ready', 'metrics'],
  });

  // Environment-aware CORS configuration
  const envOrigins = (
    process.env.ALLOWED_ORIGINS ||
    process.env.CORS_ORIGINS ||
    ''
  )
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  const defaultDevOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:8080',
  ];

  const allowedOrigins = envOrigins.length > 0 ? envOrigins : defaultDevOrigins;

  app.enableCors({
    origin: (origin, callback) => {
      // Allow non-browser requests with no origin (e.g. mobile apps, curl, health-checks)
      if (!origin) {
        return callback(null, true);
      }
      if (!isProduction) {
        if (
          allowedOrigins.includes(origin) ||
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)
        ) {
          return callback(null, true);
        }
      } else {
        if (allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'x-request-id',
      'Idempotency-Key',
      'x-razorpay-signature',
      'x-requested-with',
      'Accept',
      'Origin',
    ],
    exposedHeaders: ['x-request-id', 'Content-Range', 'X-Total-Count'],
    maxAge: 86400,
  });

  app.use(cookieParser());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Production configuration warnings
  if (isProduction) {
    if (
      !process.env.JWT_ACCESS_SECRET ||
      process.env.JWT_ACCESS_SECRET === 'kickat_super_secret_access_key_2026'
    ) {
      logger.warn(
        'SECURITY WARNING: JWT_ACCESS_SECRET is using default development secret in production environment.',
      );
    }
    if (
      !process.env.JWT_REFRESH_SECRET ||
      process.env.JWT_REFRESH_SECRET === 'kickat_super_secret_refresh_key_2026'
    ) {
      logger.warn(
        'SECURITY WARNING: JWT_REFRESH_SECRET is using default development secret in production environment.',
      );
    }
  }

  const port = process.env.PORT || 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Kickat backend server is running on port ${port} [Environment: ${process.env.NODE_ENV || 'development'}]`);
}
bootstrap();

