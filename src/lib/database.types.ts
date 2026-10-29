/**
 * Description des tables Supabase (voir supabase/schema.sql), au format attendu par le client :
 * noms de colonnes et types vérifiés à la compilation. À tenir à jour avec le schéma.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Status = 'seen' | 'unseen' | 'wish';
type Tier = 'good' | 'meh';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: { id: string; pseudo: string; friend_code: string; share_ranking: boolean; share_wishlist: boolean; created_at: string };
        Insert: { id: string; pseudo: string; friend_code?: string; share_ranking?: boolean; share_wishlist?: boolean; created_at?: string };
        // Seules ces colonnes sont modifiables (droits accordés dans le schéma) : pas le code ami.
        Update: { pseudo?: string; share_ranking?: boolean; share_wishlist?: boolean };
        Relationships: [];
      };
      answers: {
        Row: {
          user_id: string;
          key: string;
          type: 'movie' | 'tv';
          status: Status | null;
          tier: Tier | null;
          title: Json | null;
          deleted: boolean;
          client_updated_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          key: string;
          type: 'movie' | 'tv';
          status?: Status | null;
          tier?: Tier | null;
          title?: Json | null;
          deleted?: boolean;
          client_updated_at: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['answers']['Insert']>;
        Relationships: [];
      };
      user_meta: {
        Row: { user_id: string; key: string; value: Json | null; deleted: boolean; client_updated_at: string; updated_at: string };
        Insert: { user_id: string; key: string; value?: Json | null; deleted?: boolean; client_updated_at: string; updated_at?: string };
        Update: Partial<Database['public']['Tables']['user_meta']['Insert']>;
        Relationships: [];
      };
      friendships: {
        Row: { user_a: string; user_b: string; created_at: string };
        Insert: { user_a: string; user_b: string; created_at?: string };
        Update: never;
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      add_friend: { Args: { code: string }; Returns: string };
      find_friend_code: { Args: { code: string }; Returns: string | null };
      new_friend_code: { Args: Record<string, never>; Returns: string };
      delete_account: { Args: Record<string, never>; Returns: undefined };
      is_friend: { Args: { other: string }; Returns: boolean };
      friend_shares: { Args: { owner: string; what: string }; Returns: boolean };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
}
