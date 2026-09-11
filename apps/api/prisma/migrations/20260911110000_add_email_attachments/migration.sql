-- AlterTable
--
-- Nace NULL y no '[]' a proposito: NULL significa "este correo se ingirio antes
-- de que guardaramos las fichas" y '[]' significa "se miro y no tiene ninguno".
-- Los correos viejos no se pueden rellenar sin volver a pedirselos a Gmail, asi
-- que la diferencia hay que poder verla desde la base.
ALTER TABLE "Email" ADD COLUMN     "attachments" JSONB;
