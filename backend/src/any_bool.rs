// Human: Playlists store `is_public` as INTEGER (SQLite) or BOOLEAN (Postgres); sqlx Any must decode both into one Rust type.
// Agent: READS column type via ValueRef; DECODE as bool or integer; ENCODE via bool; SERIALIZE JSON as bare boolean.
use serde::{Deserialize, Serialize};
use sqlx::{
    any::{Any, AnyTypeInfo, AnyTypeInfoKind},
    database::Database,
    encode::{Encode, IsNull},
    error::BoxDynError,
    Decode, Type, ValueRef,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct AnyBool(pub bool);

impl AnyBool {
    pub fn as_bool(self) -> bool {
        self.0
    }
}

impl From<bool> for AnyBool {
    fn from(value: bool) -> Self {
        AnyBool(value)
    }
}

impl Type<Any> for AnyBool {
    fn type_info() -> AnyTypeInfo {
        <bool as Type<Any>>::type_info()
    }

    fn compatible(ty: &AnyTypeInfo) -> bool {
        matches!(ty.kind(), AnyTypeInfoKind::Bool) || ty.kind().is_integer()
    }
}

impl<'r> Decode<'r, Any> for AnyBool {
    fn decode(value: <Any as Database>::ValueRef<'r>) -> Result<Self, BoxDynError> {
        match value.type_info().as_ref().kind() {
            AnyTypeInfoKind::Bool => Ok(AnyBool(<bool as Decode<'r, Any>>::decode(value)?)),
            AnyTypeInfoKind::SmallInt | AnyTypeInfoKind::Integer | AnyTypeInfoKind::BigInt => {
                Ok(AnyBool(<i64 as Decode<'r, Any>>::decode(value)? != 0))
            }
            other => Err(format!("AnyBool: unexpected SQL type {other:?}").into()),
        }
    }
}

impl<'q> Encode<'q, Any> for AnyBool {
    fn encode_by_ref(
        &self,
        buf: &mut <Any as Database>::ArgumentBuffer<'q>,
    ) -> Result<IsNull, BoxDynError> {
        <bool as Encode<'q, Any>>::encode_by_ref(&self.0, buf)
    }
}
