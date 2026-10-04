-- 1. Avatars
DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable" ON storage.objects FOR SELECT USING ((bucket_id = 'avatars'::text));

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar" ON storage.objects FOR UPDATE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar" ON storage.objects FOR DELETE USING (((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1])));

-- 2. Chat Media
DROP POLICY IF EXISTS "Chat media is publicly readable" ON storage.objects;
CREATE POLICY "Chat media is publicly readable" ON storage.objects FOR SELECT USING ((bucket_id = 'chat-media'::text));

DROP POLICY IF EXISTS "Members can upload chat media" ON storage.objects;
CREATE POLICY "Members can upload chat media" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1]))))));

DROP POLICY IF EXISTS "Members can update chat media" ON storage.objects;
CREATE POLICY "Members can update chat media" ON storage.objects FOR UPDATE USING (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1]))))));

DROP POLICY IF EXISTS "Members can delete chat media" ON storage.objects;
CREATE POLICY "Members can delete chat media" ON storage.objects FOR DELETE USING (((bucket_id = 'chat-media'::text) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1]))))));

-- 3. Flow Media
DROP POLICY IF EXISTS "Flow media is publicly readable" ON storage.objects;
CREATE POLICY "Flow media is publicly readable" ON storage.objects FOR SELECT USING ((bucket_id = 'flow-media'::text));

DROP POLICY IF EXISTS "Members can upload flow media" ON storage.objects;
CREATE POLICY "Members can upload flow media" ON storage.objects FOR INSERT WITH CHECK (((bucket_id = 'flow-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1])))) OR ((auth.uid())::text = (storage.foldername(name))[1]))));

DROP POLICY IF EXISTS "Members can update flow media" ON storage.objects;
CREATE POLICY "Members can update flow media" ON storage.objects FOR UPDATE USING (((bucket_id = 'flow-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1])))) OR ((auth.uid())::text = (storage.foldername(name))[1]))));

DROP POLICY IF EXISTS "Members can delete flow media" ON storage.objects;
CREATE POLICY "Members can delete flow media" ON storage.objects FOR DELETE USING (((bucket_id = 'flow-media'::text) AND ((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.user_id = auth.uid()) AND (('account-'::text || (p.account_id)::text) = (storage.foldername(objects.name))[1])))) OR ((auth.uid())::text = (storage.foldername(name))[1]))));

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
