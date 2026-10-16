-- Baseline: schema completo do banco como estava em 2026-10-14 (commit b3a5bea).
-- Substitui o histórico antigo (prisma/migrations_legacy), que não reconstruía o banco do zero.
-- Banco NOVO: aplicado normalmente por 'prisma migrate deploy'.
-- Banco EXISTENTE: ver docs/MIGRATIONS-BASELINE.md (marcar como já aplicado com 'migrate resolve').

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ATHLETE', 'COACH', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "AthleteLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'ELITE');

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "WorkoutType" AS ENUM ('EASY_RUN', 'TEMPO', 'INTERVAL', 'LONG_RUN', 'RECOVERY', 'RACE', 'CROSS_TRAINING', 'REST');

-- CreateEnum
CREATE TYPE "WorkoutStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'SKIPPED', 'MISSED');

-- CreateEnum
CREATE TYPE "WorkoutSource" AS ENUM ('MANUAL', 'GARMIN', 'STRAVA', 'APPLE_HEALTH', 'GOOGLE_FIT', 'COROS', 'POLAR');

-- CreateEnum
CREATE TYPE "HeartRateZone" AS ENUM ('Z1_RECOVERY', 'Z2_EASY', 'Z3_AEROBIC', 'Z4_THRESHOLD', 'Z5_MAXIMUM');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GARMIN', 'STRAVA', 'APPLE_HEALTH', 'GOOGLE_FIT', 'COROS', 'POLAR');

-- CreateEnum
CREATE TYPE "SubscriptionPlanType" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL', 'TRIAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING', 'INCOMPLETE');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('STRIPE', 'MERCADO_PAGO', 'PAGARME');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('SUCCEEDED', 'FAILED', 'PENDING', 'REFUNDED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('WORKOUT_REMINDER', 'WORKOUT_COMPLETED', 'NEW_MESSAGE', 'PLAN_ASSIGNED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'SUBSCRIPTION_EXPIRING', 'COACH_FEEDBACK', 'EVENT_REMINDER', 'EVENT_REGISTRATION', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SOLD_OUT', 'COMPLETED', 'CANCELED');

-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELED', 'WAITLIST', 'CHECKED_IN', 'ABSENT');

-- CreateEnum
CREATE TYPE "KitType" AS ENUM ('COMPLETO', 'PREMIUM');

-- CreateEnum
CREATE TYPE "AIAssistantTone" AS ENUM ('FRIENDLY', 'PROFESSIONAL', 'MOTIVATIONAL');

-- CreateEnum
CREATE TYPE "SportNiche" AS ENUM ('RUNNING', 'CYCLING', 'TRIATHLON', 'SWIMMING', 'CROSSFIT', 'FITNESS', 'GENERAL');

-- CreateEnum
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'TEXTAREA', 'SELECT', 'MULTISELECT', 'NUMBER', 'TIME', 'DATE', 'SCALE', 'BOOLEAN');

-- CreateEnum
CREATE TYPE "OnboardingStatus" AS ENUM ('IN_PROGRESS', 'PENDING_REVIEW', 'APPROVED', 'PLAN_GENERATED');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('CAMISA', 'VISEIRA', 'BONE', 'CASACO', 'CORTA_VENTO', 'MEIA', 'CALCA', 'SHORTS', 'ACESSORIO', 'OUTRO');

-- CreateEnum
CREATE TYPE "StoreOrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "AppointmentType" AS ENUM ('ONLINE_CONSULT', 'PRESENTIAL_TRAINING', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- CreateEnum
CREATE TYPE "WhatsappMsgType" AS ENUM ('TEXT', 'AUDIO', 'IMAGE', 'VIDEO', 'DOCUMENT', 'STICKER');

-- CreateEnum
CREATE TYPE "WhatsappMsgRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "PlatformPlanType" AS ENUM ('STARTER', 'PRO', 'SCALE', 'ELITE', 'WHITE_LABEL');

-- CreateEnum
CREATE TYPE "CoachSubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "WhiteLabelStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING', 'PAID', 'CREDITED', 'CANCELLED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ATHLETE',
    "avatar_url" TEXT,
    "phone" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "timezone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "apple_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "ai_provider" TEXT NOT NULL DEFAULT 'anthropic',
    "ai_model" TEXT,
    "ai_byok" BOOLEAN NOT NULL DEFAULT false,
    "ai_api_key" TEXT,
    "totp_secret" TEXT,
    "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
    "banner_url" TEXT,
    "referral_code" TEXT,
    "referred_by_code" TEXT,
    "referral_credit_cents" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "slug" TEXT,
    "bio" TEXT,
    "specializations" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "certifications" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "max_athletes" INTEGER NOT NULL DEFAULT 30,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "payment_provider" TEXT DEFAULT 'pagarme',
    "pagarme_api_key" TEXT,
    "pagarme_webhook_secret" TEXT,
    "stripe_secret_key" TEXT,
    "stripe_webhook_secret" TEXT,
    "payment_enabled" BOOLEAN NOT NULL DEFAULT false,
    "platform_fee_percent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "niche" "SportNiche" NOT NULL DEFAULT 'RUNNING',
    "niche_config" JSONB,
    "appointment_url" TEXT,

    CONSTRAINT "coach_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "coach_id" TEXT,
    "weight" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "vo2max" DOUBLE PRECISION,
    "resting_hr" INTEGER,
    "max_hr" INTEGER,
    "weekly_goal_km" DOUBLE PRECISION,
    "level" "AthleteLevel" NOT NULL DEFAULT 'BEGINNER',
    "niche" "SportNiche" NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_plans" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" "PlanStatus" NOT NULL DEFAULT 'DRAFT',
    "weekly_frequency" INTEGER NOT NULL DEFAULT 3,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "training_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workouts" (
    "id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "scheduled_date" TIMESTAMP(3) NOT NULL,
    "type" "WorkoutType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "target_distance_meters" INTEGER,
    "target_duration_seconds" INTEGER,
    "target_pace" TEXT,
    "heart_rate_zone" "HeartRateZone",
    "status" "WorkoutStatus" NOT NULL DEFAULT 'SCHEDULED',
    "completed_at" TIMESTAMP(3),
    "coach_notes" TEXT,
    "garmin_workout_id" TEXT,
    "garmin_schedule_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workout_results" (
    "id" TEXT NOT NULL,
    "workout_id" TEXT NOT NULL,
    "source" "WorkoutSource" NOT NULL DEFAULT 'MANUAL',
    "external_id" TEXT,
    "distance_meters" INTEGER NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "avg_pace" TEXT,
    "avg_heart_rate" INTEGER,
    "max_heart_rate" INTEGER,
    "calories" INTEGER,
    "elevation_gain" DOUBLE PRECISION,
    "splits" JSONB,
    "gps_route" JSONB,
    "rpe" INTEGER,
    "sensation_score" INTEGER,
    "athlete_feedback" TEXT,
    "ai_analysis" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "workout_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fitness_integrations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT,
    "expires_at" TIMESTAMP(3),
    "external_user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fitness_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan_type" "SubscriptionPlanType" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'INCOMPLETE',
    "provider" "PaymentProvider" NOT NULL,
    "external_subscription_id" TEXT,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "trial_end" TIMESTAMP(3),
    "grace_period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "user_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "provider" "PaymentProvider" NOT NULL,
    "external_payment_id" TEXT,
    "paid_at" TIMESTAMP(3),
    "pix_qr_code" TEXT,
    "pix_qr_code_url" TEXT,
    "pix_expires_at" TIMESTAMP(3),
    "plan_id" TEXT,
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "last_message_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cover_image_url" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "event_end_date" TIMESTAMP(3),
    "location" TEXT,
    "city" TEXT,
    "state" TEXT,
    "modality" TEXT,
    "max_participants" INTEGER,
    "price" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rules" TEXT,
    "kit_description" TEXT,
    "kit_complete_price" INTEGER,
    "kit_premium_price" INTEGER,
    "kit_pickup_location" TEXT,
    "kit_pickup_date" TIMESTAMP(3),
    "route_map_url" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "meeting_point" TEXT,
    "meeting_point_lat" DOUBLE PRECISION,
    "meeting_point_lng" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_registrations" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "external_payment_id" TEXT,
    "bib_number" TEXT,
    "shirt_size" TEXT,
    "kit_type" "KitType",
    "kit_pickup_scheduled_at" TIMESTAMP(3),
    "kit_pickup_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "kit_delivered_at" TIMESTAMP(3),
    "kit_delivered_by" TEXT,
    "coupon_id" TEXT,
    "final_price" INTEGER,
    "distance_id" TEXT,
    "emergency_contact" TEXT,
    "medical_info" TEXT,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),
    "checkin_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_distances" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distance_km" DOUBLE PRECISION,
    "price" INTEGER NOT NULL DEFAULT 0,
    "max_participants" INTEGER,
    "registered_count" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "age_group" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_distances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_coupons" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_coupon_uses" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "registration_id" TEXT NOT NULL,
    "used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_coupon_uses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kit_delivery_sessions" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kit_delivery_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_invites" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "accepted_at" TIMESTAMP(3),
    "athlete_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nutrition_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "meal_name" TEXT NOT NULL,
    "meal_time" TEXT,
    "calories" INTEGER NOT NULL DEFAULT 0,
    "protein" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "carbs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "items" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nutrition_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "water_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "goal" INTEGER NOT NULL DEFAULT 3000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "water_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_brandings" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "tenant_name" TEXT NOT NULL,
    "primary_color" TEXT NOT NULL DEFAULT '#DC2626',
    "logo_url" TEXT,
    "banner_url" TEXT,
    "domain" TEXT,
    "welcome_msg" TEXT,
    "secondary_color" TEXT DEFAULT '#1F2937',
    "niche" TEXT DEFAULT 'running',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_brandings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_assistant_configs" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "assistant_name" TEXT NOT NULL DEFAULT 'Rafinha',
    "tone" "AIAssistantTone" NOT NULL DEFAULT 'FRIENDLY',
    "persona_prompt" TEXT,
    "voice_enabled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_assistant_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "garmin_health_snapshots" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "sleep_score" INTEGER,
    "sleep_hours" DOUBLE PRECISION,
    "hrv" INTEGER,
    "stress_score" INTEGER,
    "resting_hr" INTEGER,
    "steps" INTEGER,
    "spo2" DOUBLE PRECISION,
    "calories_active" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "garmin_health_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_forms" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Questionário de Anamnese',
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "niche" "SportNiche" NOT NULL DEFAULT 'RUNNING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_forms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_questions" (
    "id" TEXT NOT NULL,
    "form_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "question" TEXT NOT NULL,
    "type" "QuestionType" NOT NULL,
    "options" JSONB,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "placeholder" TEXT,
    "ai_hint" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "onboarding_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "onboarding_profiles" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "parsed_profile" JSONB,
    "ai_summary" TEXT,
    "status" "OnboardingStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "completed_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "onboarding_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "physical_assessments" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "assessed_at" TIMESTAMP(3) NOT NULL,
    "weight_kg" DOUBLE PRECISION,
    "height_cm" DOUBLE PRECISION,
    "bmi" DOUBLE PRECISION,
    "body_fat_pct" DOUBLE PRECISION,
    "muscle_mass_pct" DOUBLE PRECISION,
    "resting_hr" INTEGER,
    "max_hr" INTEGER,
    "vo2max" DOUBLE PRECISION,
    "best_5k_time" INTEGER,
    "best_10k_time" INTEGER,
    "vdot" DOUBLE PRECISION,
    "flex_score" INTEGER,
    "strength_score" INTEGER,
    "hr_zones" JSONB,
    "pace_zones" JSONB,
    "ai_analysis" TEXT,
    "coach_notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "physical_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_brain_sessions" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "title" TEXT,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_brain_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ProductCategory" NOT NULL DEFAULT 'OUTRO',
    "price_in_cents" INTEGER NOT NULL DEFAULT 0,
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "colors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "total_stock" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "athlete_discount_percent" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_orders" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "athlete_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "customer_phone" TEXT,
    "size" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "total_in_cents" INTEGER NOT NULL,
    "discount_in_cents" INTEGER NOT NULL DEFAULT 0,
    "final_in_cents" INTEGER,
    "coupon_id" TEXT,
    "status" "StoreOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "payment_id" TEXT,
    "payment_url" TEXT,
    "shipping_address" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "store_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "store_coupons" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "max_uses" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "store_coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "athlete_id" TEXT,
    "customer_name" TEXT NOT NULL,
    "customer_email" TEXT NOT NULL,
    "customer_phone" TEXT,
    "type" "AppointmentType" NOT NULL DEFAULT 'ONLINE_CONSULT',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration_minutes" INTEGER NOT NULL DEFAULT 60,
    "price_in_cents" INTEGER NOT NULL DEFAULT 30000,
    "calendly_event_id" TEXT,
    "calendly_uri" TEXT,
    "notes" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "context" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" "WhatsappMsgRole" NOT NULL,
    "type" "WhatsappMsgType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "media_url" TEXT,
    "external_id" TEXT,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "max_retries" INTEGER NOT NULL DEFAULT 3,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "error" TEXT,
    "coach_id" TEXT,
    "athlete_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_plans" (
    "id" TEXT NOT NULL,
    "type" "PlatformPlanType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price_in_cents" INTEGER NOT NULL,
    "max_athletes" INTEGER,
    "max_coaches" INTEGER,
    "features" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coach_subscriptions" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "plan_id" TEXT NOT NULL,
    "status" "CoachSubscriptionStatus" NOT NULL DEFAULT 'TRIAL',
    "trial_ends_at" TIMESTAMP(3),
    "current_period_start" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "external_id" TEXT,
    "white_label_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coach_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "white_label_accounts" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "brand_name" TEXT NOT NULL,
    "custom_domain" TEXT,
    "logo_url" TEXT,
    "primary_color" TEXT,
    "max_coaches" INTEGER NOT NULL DEFAULT 5,
    "status" "WhiteLabelStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "white_label_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "badges" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'performance',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_badges" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "badge_id" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "athlete_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'zapi',
    "phone" TEXT NOT NULL DEFAULT '',
    "api_token" TEXT NOT NULL DEFAULT '',
    "instance_id" TEXT NOT NULL DEFAULT '',
    "welcome_message" TEXT NOT NULL DEFAULT 'Olá {nome}! Sou o assistente do {coachName}. Acesse: {onboardingLink}',
    "is_connected" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "testimonials" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "testimonials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_documents" (
    "id" TEXT NOT NULL,
    "athlete_id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size_kb" INTEGER,
    "category" TEXT NOT NULL DEFAULT 'general',
    "description" TEXT,
    "ai_analysis" TEXT,
    "ai_status" TEXT NOT NULL DEFAULT 'PENDING',
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "referrer_id" TEXT NOT NULL,
    "referee_id" TEXT,
    "code" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING',
    "reward_cents" INTEGER NOT NULL DEFAULT 5000,
    "referee_reward_cents" INTEGER NOT NULL DEFAULT 3000,
    "referee_email" TEXT,
    "paid_at" TIMESTAMP(3),
    "credited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete_supplements" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dose" TEXT,
    "time_of_day" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "athlete_supplements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplement_intakes" (
    "id" TEXT NOT NULL,
    "supplement_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "taken_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplement_intakes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "coach_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "logo_url" TEXT,
    "emoji" TEXT,
    "color" TEXT,
    "link_url" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_apple_id_key" ON "users"("apple_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_referral_code_key" ON "users"("referral_code");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "users_referral_code_idx" ON "users"("referral_code");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_user_id_key" ON "coach_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_profiles_slug_key" ON "coach_profiles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_profiles_user_id_key" ON "athlete_profiles"("user_id");

-- CreateIndex
CREATE INDEX "athlete_profiles_coach_id_idx" ON "athlete_profiles"("coach_id");

-- CreateIndex
CREATE INDEX "training_plans_athlete_id_status_idx" ON "training_plans"("athlete_id", "status");

-- CreateIndex
CREATE INDEX "training_plans_coach_id_idx" ON "training_plans"("coach_id");

-- CreateIndex
CREATE INDEX "training_plans_status_idx" ON "training_plans"("status");

-- CreateIndex
CREATE INDEX "workouts_athlete_id_scheduled_date_idx" ON "workouts"("athlete_id", "scheduled_date");

-- CreateIndex
CREATE INDEX "workouts_athlete_id_status_idx" ON "workouts"("athlete_id", "status");

-- CreateIndex
CREATE INDEX "workouts_plan_id_idx" ON "workouts"("plan_id");

-- CreateIndex
CREATE INDEX "workouts_type_idx" ON "workouts"("type");

-- CreateIndex
CREATE INDEX "workouts_completed_at_idx" ON "workouts"("completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "workout_results_workout_id_key" ON "workout_results"("workout_id");

-- CreateIndex
CREATE INDEX "workout_results_external_id_idx" ON "workout_results"("external_id");

-- CreateIndex
CREATE INDEX "workout_results_created_at_idx" ON "workout_results"("created_at");

-- CreateIndex
CREATE INDEX "fitness_integrations_is_active_idx" ON "fitness_integrations"("is_active");

-- CreateIndex
CREATE INDEX "fitness_integrations_provider_idx" ON "fitness_integrations"("provider");

-- CreateIndex
CREATE INDEX "fitness_integrations_expires_at_idx" ON "fitness_integrations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "fitness_integrations_user_id_provider_key" ON "fitness_integrations"("user_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_external_subscription_id_key" ON "subscriptions"("external_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_user_id_status_idx" ON "subscriptions"("user_id", "status");

-- CreateIndex
CREATE INDEX "subscriptions_external_subscription_id_idx" ON "subscriptions"("external_subscription_id");

-- CreateIndex
CREATE INDEX "subscriptions_provider_idx" ON "subscriptions"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "payments_external_payment_id_key" ON "payments"("external_payment_id");

-- CreateIndex
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_subscription_id_idx" ON "payments"("subscription_id");

-- CreateIndex
CREATE INDEX "payments_paid_at_idx" ON "payments"("paid_at");

-- CreateIndex
CREATE INDEX "conversations_athlete_id_idx" ON "conversations"("athlete_id");

-- CreateIndex
CREATE INDEX "conversations_coach_id_idx" ON "conversations"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_athlete_id_coach_id_key" ON "conversations"("athlete_id", "coach_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_id_idx" ON "messages"("sender_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE UNIQUE INDEX "app_configs_key_key" ON "app_configs"("key");

-- CreateIndex
CREATE INDEX "events_event_date_idx" ON "events"("event_date");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_created_by_id_idx" ON "events"("created_by_id");

-- CreateIndex
CREATE INDEX "events_modality_idx" ON "events"("modality");

-- CreateIndex
CREATE INDEX "event_registrations_user_id_idx" ON "event_registrations"("user_id");

-- CreateIndex
CREATE INDEX "event_registrations_status_idx" ON "event_registrations"("status");

-- CreateIndex
CREATE INDEX "event_registrations_paymentStatus_idx" ON "event_registrations"("paymentStatus");

-- CreateIndex
CREATE UNIQUE INDEX "event_registrations_event_id_user_id_key" ON "event_registrations"("event_id", "user_id");

-- CreateIndex
CREATE INDEX "event_distances_event_id_idx" ON "event_distances"("event_id");

-- CreateIndex
CREATE INDEX "event_coupons_event_id_idx" ON "event_coupons"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_coupons_event_id_code_key" ON "event_coupons"("event_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "event_coupon_uses_registration_id_key" ON "event_coupon_uses"("registration_id");

-- CreateIndex
CREATE INDEX "event_coupon_uses_coupon_id_idx" ON "event_coupon_uses"("coupon_id");

-- CreateIndex
CREATE UNIQUE INDEX "kit_delivery_sessions_token_key" ON "kit_delivery_sessions"("token");

-- CreateIndex
CREATE INDEX "kit_delivery_sessions_event_id_idx" ON "kit_delivery_sessions"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "coach_invites_token_key" ON "coach_invites"("token");

-- CreateIndex
CREATE INDEX "coach_invites_coach_id_idx" ON "coach_invites"("coach_id");

-- CreateIndex
CREATE INDEX "coach_invites_email_idx" ON "coach_invites"("email");

-- CreateIndex
CREATE INDEX "coach_invites_token_idx" ON "coach_invites"("token");

-- CreateIndex
CREATE INDEX "coach_invites_status_idx" ON "coach_invites"("status");

-- CreateIndex
CREATE INDEX "nutrition_logs_user_id_idx" ON "nutrition_logs"("user_id");

-- CreateIndex
CREATE INDEX "nutrition_logs_user_id_date_idx" ON "nutrition_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "water_logs_user_id_idx" ON "water_logs"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "water_logs_user_id_date_key" ON "water_logs"("user_id", "date");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brandings_coach_id_key" ON "tenant_brandings"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_brandings_domain_key" ON "tenant_brandings"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "ai_assistant_configs_coach_id_key" ON "ai_assistant_configs"("coach_id");

-- CreateIndex
CREATE INDEX "garmin_health_snapshots_athlete_id_idx" ON "garmin_health_snapshots"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "garmin_health_snapshots_athlete_id_date_key" ON "garmin_health_snapshots"("athlete_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_forms_coach_id_key" ON "onboarding_forms"("coach_id");

-- CreateIndex
CREATE INDEX "onboarding_questions_form_id_order_idx" ON "onboarding_questions"("form_id", "order");

-- CreateIndex
CREATE UNIQUE INDEX "onboarding_profiles_athlete_id_key" ON "onboarding_profiles"("athlete_id");

-- CreateIndex
CREATE INDEX "onboarding_profiles_coach_id_status_idx" ON "onboarding_profiles"("coach_id", "status");

-- CreateIndex
CREATE INDEX "physical_assessments_athlete_id_assessed_at_idx" ON "physical_assessments"("athlete_id", "assessed_at");

-- CreateIndex
CREATE INDEX "coach_brain_sessions_coach_id_idx" ON "coach_brain_sessions"("coach_id");

-- CreateIndex
CREATE INDEX "products_coach_id_active_idx" ON "products"("coach_id", "active");

-- CreateIndex
CREATE INDEX "products_category_idx" ON "products"("category");

-- CreateIndex
CREATE INDEX "store_orders_product_id_idx" ON "store_orders"("product_id");

-- CreateIndex
CREATE INDEX "store_orders_status_idx" ON "store_orders"("status");

-- CreateIndex
CREATE INDEX "store_orders_customer_email_idx" ON "store_orders"("customer_email");

-- CreateIndex
CREATE INDEX "store_coupons_coach_id_idx" ON "store_coupons"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "store_coupons_coach_id_code_key" ON "store_coupons"("coach_id", "code");

-- CreateIndex
CREATE INDEX "appointments_coach_id_scheduled_at_idx" ON "appointments"("coach_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "appointments_status_idx" ON "appointments"("status");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_coach_id_idx" ON "whatsapp_conversations"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_coach_id_phone_key" ON "whatsapp_conversations"("coach_id", "phone");

-- CreateIndex
CREATE INDEX "whatsapp_messages_conversation_id_idx" ON "whatsapp_messages"("conversation_id");

-- CreateIndex
CREATE INDEX "ai_jobs_status_retries_idx" ON "ai_jobs"("status", "retries");

-- CreateIndex
CREATE INDEX "ai_jobs_coach_id_idx" ON "ai_jobs"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_plans_type_key" ON "platform_plans"("type");

-- CreateIndex
CREATE UNIQUE INDEX "coach_subscriptions_coach_id_key" ON "coach_subscriptions"("coach_id");

-- CreateIndex
CREATE INDEX "coach_subscriptions_status_idx" ON "coach_subscriptions"("status");

-- CreateIndex
CREATE INDEX "coach_subscriptions_white_label_id_idx" ON "coach_subscriptions"("white_label_id");

-- CreateIndex
CREATE UNIQUE INDEX "white_label_accounts_owner_id_key" ON "white_label_accounts"("owner_id");

-- CreateIndex
CREATE UNIQUE INDEX "white_label_accounts_custom_domain_key" ON "white_label_accounts"("custom_domain");

-- CreateIndex
CREATE UNIQUE INDEX "badges_key_key" ON "badges"("key");

-- CreateIndex
CREATE INDEX "athlete_badges_athlete_id_idx" ON "athlete_badges"("athlete_id");

-- CreateIndex
CREATE UNIQUE INDEX "athlete_badges_athlete_id_badge_id_key" ON "athlete_badges"("athlete_id", "badge_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_coach_id_key" ON "whatsapp_configs"("coach_id");

-- CreateIndex
CREATE INDEX "testimonials_coach_id_idx" ON "testimonials"("coach_id");

-- CreateIndex
CREATE INDEX "testimonials_is_featured_idx" ON "testimonials"("is_featured");

-- CreateIndex
CREATE UNIQUE INDEX "testimonials_athlete_id_coach_id_key" ON "testimonials"("athlete_id", "coach_id");

-- CreateIndex
CREATE INDEX "athlete_documents_athlete_id_idx" ON "athlete_documents"("athlete_id");

-- CreateIndex
CREATE INDEX "athlete_documents_coach_id_idx" ON "athlete_documents"("coach_id");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referee_id_key" ON "referrals"("referee_id");

-- CreateIndex
CREATE INDEX "referrals_referrer_id_idx" ON "referrals"("referrer_id");

-- CreateIndex
CREATE INDEX "referrals_code_idx" ON "referrals"("code");

-- CreateIndex
CREATE INDEX "referrals_status_idx" ON "referrals"("status");

-- CreateIndex
CREATE INDEX "athlete_supplements_user_id_idx" ON "athlete_supplements"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplement_intakes_supplement_id_date_key" ON "supplement_intakes"("supplement_id", "date");

-- CreateIndex
CREATE INDEX "partners_coach_id_idx" ON "partners"("coach_id");

-- CreateIndex
CREATE INDEX "partners_is_active_idx" ON "partners"("is_active");

-- AddForeignKey
ALTER TABLE "coach_profiles" ADD CONSTRAINT "coach_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_profiles" ADD CONSTRAINT "athlete_profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_plans" ADD CONSTRAINT "training_plans_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "training_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workout_results" ADD CONSTRAINT "workout_results_workout_id_fkey" FOREIGN KEY ("workout_id") REFERENCES "workouts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fitness_integrations" ADD CONSTRAINT "fitness_integrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "event_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_distance_id_fkey" FOREIGN KEY ("distance_id") REFERENCES "event_distances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_distances" ADD CONSTRAINT "event_distances_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_coupons" ADD CONSTRAINT "event_coupons_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_coupon_uses" ADD CONSTRAINT "event_coupon_uses_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "event_coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_coupon_uses" ADD CONSTRAINT "event_coupon_uses_registration_id_fkey" FOREIGN KEY ("registration_id") REFERENCES "event_registrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kit_delivery_sessions" ADD CONSTRAINT "kit_delivery_sessions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_invites" ADD CONSTRAINT "coach_invites_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nutrition_logs" ADD CONSTRAINT "nutrition_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_brandings" ADD CONSTRAINT "tenant_brandings_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_assistant_configs" ADD CONSTRAINT "ai_assistant_configs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "garmin_health_snapshots" ADD CONSTRAINT "garmin_health_snapshots_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_forms" ADD CONSTRAINT "onboarding_forms_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_questions" ADD CONSTRAINT "onboarding_questions_form_id_fkey" FOREIGN KEY ("form_id") REFERENCES "onboarding_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_profiles" ADD CONSTRAINT "onboarding_profiles_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "onboarding_profiles" ADD CONSTRAINT "onboarding_profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_assessments" ADD CONSTRAINT "physical_assessments_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "physical_assessments" ADD CONSTRAINT "physical_assessments_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_brain_sessions" ADD CONSTRAINT "coach_brain_sessions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_orders" ADD CONSTRAINT "store_orders_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "store_coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "store_coupons" ADD CONSTRAINT "store_coupons_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "whatsapp_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_subscriptions" ADD CONSTRAINT "coach_subscriptions_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_subscriptions" ADD CONSTRAINT "coach_subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "platform_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coach_subscriptions" ADD CONSTRAINT "coach_subscriptions_white_label_id_fkey" FOREIGN KEY ("white_label_id") REFERENCES "white_label_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "white_label_accounts" ADD CONSTRAINT "white_label_accounts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_badges" ADD CONSTRAINT "athlete_badges_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_badges" ADD CONSTRAINT "athlete_badges_badge_id_fkey" FOREIGN KEY ("badge_id") REFERENCES "badges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "testimonials" ADD CONSTRAINT "testimonials_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_athlete_id_fkey" FOREIGN KEY ("athlete_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_documents" ADD CONSTRAINT "athlete_documents_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referrer_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_referee_id_fkey" FOREIGN KEY ("referee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "athlete_supplements" ADD CONSTRAINT "athlete_supplements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplement_intakes" ADD CONSTRAINT "supplement_intakes_supplement_id_fkey" FOREIGN KEY ("supplement_id") REFERENCES "athlete_supplements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partners" ADD CONSTRAINT "partners_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

