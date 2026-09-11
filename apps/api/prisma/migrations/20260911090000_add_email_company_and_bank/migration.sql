-- AlterTable
--
-- Las dos son opcionales y nacen en NULL a proposito: NULL significa "en este
-- correo no hay ninguna de las que nos importan", que no es lo mismo que una
-- cadena vacia ni que un valor de respaldo. Los correos ya clasificados se
-- quedan en NULL hasta que alguien los reprocese, y la bandeja los agrupa en
-- "sin banco" / "sin empresa" sin mentir sobre ellos.
ALTER TABLE "Email" ADD COLUMN     "bank" TEXT,
ADD COLUMN     "company" TEXT;
