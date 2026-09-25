--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.2

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA IF NOT EXISTS public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: admin_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_config (
    id integer DEFAULT 1 NOT NULL,
    password_hash text,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT single_row CHECK ((id = 1))
);


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    brand_name text DEFAULT 'MAMANAIY.NET'::text NOT NULL,
    wa_number text DEFAULT '085212551180'::text NOT NULL,
    wifi_name text DEFAULT 'MAMANAIY.NET'::text NOT NULL,
    prices jsonb DEFAULT '{"2jam/2k": 2000, "BULANAN": 50000, "default": 0, "5jam/3rb": 3000, "MINGGUAN": 30000, "10jam/5rb": 5000, "24jam/10rb": 10000, "TRIAL-USER": 0}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    router_id uuid NOT NULL,
    voucher_template text DEFAULT 'klasik'::text NOT NULL,
    logo_url text,
    logo_size integer DEFAULT 100 NOT NULL,
    logo_offset_x integer DEFAULT 0 NOT NULL,
    CONSTRAINT app_settings_template_check CHECK ((voucher_template = ANY (ARRAY['klasik'::text, 'tiket'::text, 'modern'::text])))
);


--
-- Name: hotspot_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hotspot_profiles (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    name text NOT NULL,
    rate_limit text,
    shared_users integer DEFAULT 1,
    validity text,
    price integer DEFAULT 0 NOT NULL,
    color text DEFAULT '#7C3AED'::text,
    is_active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id bigint NOT NULL,
    ip text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.login_attempts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.login_attempts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: routers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.routers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    host text NOT NULL,
    port integer DEFAULT 8728 NOT NULL,
    username text NOT NULL,
    password text NOT NULL,
    local_ip text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    ftp_port integer DEFAULT 21 NOT NULL
);


--
-- Name: sales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sales (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    voucher_id uuid,
    username text NOT NULL,
    profile_name text NOT NULL,
    price integer NOT NULL,
    sold_at timestamp with time zone DEFAULT now(),
    sold_by text DEFAULT 'admin'::text
);


--
-- Name: voucher_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.voucher_batches (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    profile_id uuid,
    profile_name text NOT NULL,
    quantity integer NOT NULL,
    prefix text,
    price integer NOT NULL,
    generated_by text,
    note text,
    created_at timestamp with time zone DEFAULT now(),
    router_id uuid
);


--
-- Name: vouchers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vouchers (
    id uuid DEFAULT extensions.uuid_generate_v4() NOT NULL,
    batch_id uuid,
    username text NOT NULL,
    password text NOT NULL,
    profile_name text NOT NULL,
    price integer DEFAULT 0 NOT NULL,
    limit_uptime text,
    limit_bytes_total text,
    status text DEFAULT 'unused'::text NOT NULL,
    comment text,
    sold_at timestamp with time zone,
    used_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now(),
    router_id uuid NOT NULL,
    note text,
    price_override boolean DEFAULT false NOT NULL
);


--
-- Name: admin_config admin_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_config
    ADD CONSTRAINT admin_config_pkey PRIMARY KEY (id);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (router_id);


--
-- Name: hotspot_profiles hotspot_profiles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotspot_profiles
    ADD CONSTRAINT hotspot_profiles_name_key UNIQUE (name);


--
-- Name: hotspot_profiles hotspot_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hotspot_profiles
    ADD CONSTRAINT hotspot_profiles_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: routers routers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.routers
    ADD CONSTRAINT routers_pkey PRIMARY KEY (id);


--
-- Name: sales sales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_pkey PRIMARY KEY (id);


--
-- Name: voucher_batches voucher_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_batches
    ADD CONSTRAINT voucher_batches_pkey PRIMARY KEY (id);


--
-- Name: vouchers vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_pkey PRIMARY KEY (id);


--
-- Name: idx_sales_sold_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sales_sold_at ON public.sales USING btree (sold_at);


--
-- Name: idx_vouchers_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_batch ON public.vouchers USING btree (batch_id);


--
-- Name: idx_vouchers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_status ON public.vouchers USING btree (status);


--
-- Name: idx_vouchers_username; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_vouchers_username ON public.vouchers USING btree (username);


--
-- Name: login_attempts_ip_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX login_attempts_ip_created_idx ON public.login_attempts USING btree (ip, created_at DESC);


--
-- Name: vouchers_router_username_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vouchers_router_username_idx ON public.vouchers USING btree (router_id, username);


--
-- Name: vouchers_username_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX vouchers_username_unique ON public.vouchers USING btree (username);


--
-- Name: app_settings app_settings_router_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_router_id_fkey FOREIGN KEY (router_id) REFERENCES public.routers(id);


--
-- Name: sales sales_voucher_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sales
    ADD CONSTRAINT sales_voucher_id_fkey FOREIGN KEY (voucher_id) REFERENCES public.vouchers(id);


--
-- Name: voucher_batches voucher_batches_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_batches
    ADD CONSTRAINT voucher_batches_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.hotspot_profiles(id);


--
-- Name: voucher_batches voucher_batches_router_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.voucher_batches
    ADD CONSTRAINT voucher_batches_router_id_fkey FOREIGN KEY (router_id) REFERENCES public.routers(id);


--
-- Name: vouchers vouchers_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.voucher_batches(id) ON DELETE SET NULL;


--
-- Name: vouchers vouchers_router_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vouchers
    ADD CONSTRAINT vouchers_router_id_fkey FOREIGN KEY (router_id) REFERENCES public.routers(id);


--
-- Name: admin_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.admin_config ENABLE ROW LEVEL SECURITY;

--
-- Name: app_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: hotspot_profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hotspot_profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: routers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.routers ENABLE ROW LEVEL SECURITY;

--
-- Name: sales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

--
-- Name: voucher_batches; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.voucher_batches ENABLE ROW LEVEL SECURITY;

--
-- Name: vouchers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

--
-- PostgreSQL database dump complete
--


